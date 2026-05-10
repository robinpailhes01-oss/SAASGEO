// =====================================================================
// Prompt : synthese finale de l'audit + recommandations priorisees.
// Modele cible : Claude Sonnet 4.6 (cout ~0.05€/audit).
//
// Input : agregation tech audit + visibility tracking + analyses.
// Output : phrase verdict + 5-15 recommandations classees par priorite.
// =====================================================================

import { z } from "zod";

export const RecommendationSchema = z.object({
  priority: z
    .enum(["quick_win", "medium", "long_term"])
    .describe("Priorite de la recommandation"),
  category: z
    .string()
    .describe(
      "Categorie courte. Ex: 'robots.txt', 'schema', 'content', 'authority', 'GEO triptych'"
    ),
  title: z.string().describe("Titre court et actionnable (max 80 chars)"),
  description: z
    .string()
    .describe("Description concrete et actionnable (max 300 chars)"),
  impact_score: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe("Impact estime sur le score GEO global (1=faible, 10=tres fort)"),
});

export const SynthesisSchema = z.object({
  verdict: z
    .string()
    .describe(
      "Phrase de verdict en 1-2 lignes max, factuelle et impactante. Ex: 'Vous etes invisible sur Perplexity et Gemini, present mais en 4e position sur ChatGPT.'"
    ),
  top_competitor: z
    .string()
    .nullable()
    .describe("Concurrent qui ressort le plus a votre place dans les reponses IA, ou null"),
  recommendations: z
    .array(RecommendationSchema)
    .min(5)
    .max(15)
    .describe(
      "5 a 15 recommandations actionnables, classees par priorite (quick_win en premier)"
    ),
});

export type Synthesis = z.infer<typeof SynthesisSchema>;

interface SynthesisInput {
  brand_name: string;
  industry: string | null;
  // Localisation pour personnaliser les recommandations (ex: "creez une
  // page services a Carnon" au lieu de "ameliorez votre presence locale").
  city?: string | null;
  region?: string | null;
  technical_score: number;       // /100
  visibility_score: number;      // /100
  visibility_per_provider: Record<string, number>;
  mention_rate: number;          // 0-100
  citation_rate: number;         // 0-100
  top_competitors_observed: string[];
  failed_tech_checks: { label: string; recommendation?: string }[];
  passed_tech_checks_count: number;
  total_tech_checks: number;
  // Opportunites manquees concretes : queries ou la marque est absente
  // alors qu'au moins un concurrent (idealement du top) est cite.
  // Le LLM utilise ces exemples pour formuler des recommandations
  // personnalisees ("Vous ratez 'hotel romantique Carnon' — Domaine
  // de Verchant y est cite a votre place. Action : ...")
  missed_opportunities?: Array<{
    query: string;
    category: string;     // branded | service | comparative
    provider: string;     // openai | anthropic | perplexity | gemini
    competitors_cited: string[];
  }>;
  // Contextes des concurrents : pour chaque top concurrent (3 max),
  // extraits des reponses IA qui expliquent POURQUOI il est cite
  // ("Click&Boat est l'une des plus grandes plateformes...", "Bateau
  // Loc, base a Carnon, propose..."). Le LLM s'en sert pour generer
  // des recommandations comparatives PRECISES (ex: "Click&Boat gagne
  // sur le volume — vous, gagnez sur le local : creez X").
  competitor_contexts?: Record<string, string[]>;
}

export function buildSynthesisPrompt(input: SynthesisInput): {
  system: string;
  prompt: string;
} {
  const locationLabel = input.city
    ? `${input.city}${input.region ? `, ${input.region}` : ""}`
    : input.region ?? null;

  // Block "OPPORTUNITES MANQUEES" — coeur de la personnalisation.
  // On limite a 8 exemples pour garder le prompt compact (~600-800
  // tokens supplementaires max).
  const missedBlock =
    input.missed_opportunities && input.missed_opportunities.length > 0
      ? `\n\nOPPORTUNITES MANQUEES (questions ou ${input.brand_name} est ABSENT et un concurrent est CITE) :
${input.missed_opportunities
  .slice(0, 8)
  .map(
    (m, i) =>
      `  ${i + 1}. "${m.query}" [${m.category} sur ${m.provider}] — concurrent(s) cite(s) : ${m.competitors_cited.slice(0, 3).join(", ")}`
  )
  .join("\n")}

Ces opportunites manquees sont la matiere premiere des recommandations. CHAQUE recommandation doit faire reference soit a une question precise de cette liste, soit a un concurrent reel detecte.`
      : "";

  // Block "POURQUOI VOS CONCURRENTS APPARAISSENT" — extraits bruts
  // des reponses IA qui DECRIVENT chaque concurrent. Ce sont les
  // arguments que les IA utilisent pour les citer ; en miroir,
  // ils revelent ce que la marque doit construire ou defendre.
  const competitorContextsBlock =
    input.competitor_contexts && Object.keys(input.competitor_contexts).length > 0
      ? `\n\nPOURQUOI CES CONCURRENTS APPARAISSENT (extraits bruts des reponses IA) :
${Object.entries(input.competitor_contexts)
  .map(
    ([name, excerpts]) =>
      `  • ${name} :\n${excerpts.map((e) => `      "${e}"`).join("\n")}`
  )
  .join("\n")}

Ces extraits revelent les ARGUMENTS que les IA utilisent pour citer ces concurrents (volume, anciennete, specialisation, localisation, type de flotte, etc.). UTILISE ces arguments pour formuler des recommandations comparatives :
  - Si un concurrent gagne sur le volume -> ${input.brand_name} gagne sur le LOCAL/SPECIALISATION
  - Si un concurrent gagne sur la notoriete -> ${input.brand_name} gagne sur l'EXPERTISE/PROXIMITE
  - Si un concurrent gagne sur les avis -> action concrete : collecter avis Google
  - Si un concurrent est cite avec des donnees precises (tarifs, flotte, services) -> ${input.brand_name} doit publier ces memes donnees sur son site`
      : "";

  const locationBlock = locationLabel
    ? `\nLocalisation : ${locationLabel}`
    : "";

  return {
    system: `Tu es un consultant senior qui aide des commercants francais (PME locales, hotels, restaurants, services) a etre cites par les IA conversationnelles. Ton interlocuteur ne connait RIEN a la technique. Il comprend "clients perdus" et "chiffre d'affaires" — pas "score" ni jargon.

REGLES DE LANGAGE — INTERDIT ABSOLU :
Aucune recommandation ne doit contenir les termes suivants :
- "llms.txt"          -> dis "un fichier qui explique votre activite aux IA"
- "schema.org"        -> dis "une balise invisible sur votre site"
- "JSON-LD"           -> dis "un balisage technique de vos pages"
- "robots.txt"        -> dis "les autorisations donnees aux IA"
- "GPTBot" "ClaudeBot" "CrawlBot" "PerplexityBot" -> dis "les robots de ChatGPT et Google"
- "GEO" "SEO"         -> dis "votre visibilite dans les IA" ou "la facon dont les IA vous lisent"
- "User-agent" "sitemap.xml" "header HTTP" -> reformule en langage simple
- "+X points" "score" "metric" "KPI" -> ne PAS quantifier d'impact en chiffres
- "+X clients/mois" "Y nouvelles ventes" "Z% de conversion en plus" -> INTERDIT, ce sont des chiffres inventes qui nuisent a la credibilite. Reste qualitatif (delai et niveau d'effort suffisent — l'impact chiffre est calcule automatiquement par Ankora apres la reco, ne le pre-empte pas dans la description).
- "API" "endpoint" "JSON" "code"      -> reformule sans jargon technique

REGLES STRICTES POUR LES RECOMMANDATIONS — MODE COMPETITIVE INTEL :
1. Chaque recommandation est ecrite POUR ${input.brand_name}, en parlant a son dirigeant. Pas "il faut", mais "vous gagnerez", "vous perdez", "creez", "ajoutez".
2. **OBLIGATOIRE** : AU MINIMUM 4 recommandations sur 5 (idealement TOUTES) doivent citer NOMINATIVEMENT un concurrent reel detecte (parmi top_competitors_observed) OU une question precise manquee (parmi missed_opportunities). Les recos generiques sectorielles sont en derniere position et JAMAIS dans le top 3.
3. **STRUCTURE OBLIGATOIRE de la description** : commence par "Pourquoi : [observation factuelle sur ce que le concurrent fait/a, tiree des extraits POURQUOI CES CONCURRENTS APPARAISSENT si dispo]." puis "Action : [action concrete que ${input.brand_name} doit faire, en imperatif]." Exemple : "Pourquoi : Click&Boat est cite avec sa flotte de 2000+ bateaux et son systeme d'avis verifies. Action : creez sur votre site une page qui liste vos bateaux avec photos + tarifs + 1 avis client par bateau, et collectez 30 avis Google en 60 jours."
4. Si applicable, ajoute "Pas besoin de developpeur" pour rassurer.
5. Format des champs :
   - title (max 80 chars) = LE CONSTAT FACTUEL : "[Concurrent] apparait a votre place sur '[query/theme]'" ou "Vous n'apparaissez pas sur '[theme]'". JAMAIS de titre generique sans nom propre.
   - description (max 300 chars) = "Pourquoi : ... Action : ..." en francais simple, sans jargon.
6. **INTERDIT GENERIQUE** : "Ameliorez votre presence", "Optimisez votre referencement", "Travaillez votre marque", "Creez du contenu de qualite" -> rejete sans appel. Une reco sans nom propre de concurrent ni query precise est consideree comme INVALIDE.
7. **ACCEPTE personnalise** : "Click&Boat capte 'location bateau ${locationLabel ?? "Montpellier"}' a votre place. Pourquoi : il est cite avec sa flotte massive et ses avis verifies. Action : creez une page /location-bateau-${locationLabel ? locationLabel.toLowerCase().split(",")[0].trim() : "votre-ville"} qui liste vos bateaux + tarifs + 1 avis par bateau. Pas besoin de developpeur."
8. **MIROIR DAVID-GOLIATH** : si un concurrent est plus gros (Click&Boat, SamBoat, Booking…), NE PAS proposer de copier sa strategie. Toujours pivoter vers un avantage actionnable pour une PME : local, specialisation, experience humaine, avis, page dediee a une niche.

Tu reponds UNIQUEMENT avec un JSON valide matchant le schema demande.`,
    prompt: `Synthetise l'audit GEO du business suivant :

Marque : ${input.brand_name}
Secteur : ${input.industry ?? "non precise"}${locationBlock}

SCORES :
- Score technique : ${input.technical_score}/100
- Score visibility IA : ${input.visibility_score}/100
- Taux de mention textuelle : ${input.mention_rate.toFixed(1)}%
- Taux de citation source : ${input.citation_rate.toFixed(1)}%

VISIBILITE PAR PROVIDER (sur 100) :
${Object.entries(input.visibility_per_provider)
  .map(([p, s]) => `  - ${p} : ${s}/100`)
  .join("\n")}

CONCURRENTS QUI APPARAISSENT LE PLUS a la place de ${input.brand_name} dans les reponses IA :
${input.top_competitors_observed.length > 0 ? input.top_competitors_observed.slice(0, 5).map((c) => `  - ${c}`).join("\n") : "  (aucun concurrent identifie)"}

CHECKS TECHNIQUES :
- ${input.passed_tech_checks_count} pass / ${input.total_tech_checks} total
- Top fails :
${input.failed_tech_checks
  .slice(0, 10)
  .map((c) => `  - ${c.label}${c.recommendation ? ` → ${c.recommendation.slice(0, 100)}` : ""}`)
  .join("\n")}${missedBlock}${competitorContextsBlock}

Format de reponse JSON :

{
  "verdict": "Phrase courte (1-2 lignes) qui resume la situation avec des chiffres. Doit etre brutal et factuel, pas du blabla.",
  "top_competitor": "string ou null — le concurrent qui ressort le plus a la place de ${input.brand_name}",
  "recommendations": [
    {
      "priority": "quick_win" | "medium" | "long_term",
      "category": "string courte (ex: 'contenu', 'reputation', 'fichier IA')",
      "title": "LE CONSTAT en francais simple (max 80 chars). Pas de jargon. Format prefere : '[Concurrent] apparait a votre place sur \\"[query]\\"' OU 'Vous etes absent de \\"[theme]\\"'",
      "description": "L'ACTION concrete en francais simple (max 300 chars), sans jargon technique. 1 a 2 phrases. Inclure 'Pas besoin de developpeur' si applicable. Eviter le futur conditionnel : utilise des imperatifs (creez, ajoutez, demandez).",
      "impact_score": 1-10
    }
  ]
}

Genere entre 5 et 15 recommandations. Quick wins en premier (impact eleve / effort faible). **AU MINIMUM 4 recommandations sur 5 (idealement TOUTES)** DOIVENT etre personnalisees (citer un concurrent reel par son nom propre ET/OU une query manquee precise) ET suivre la structure "Pourquoi : ... Action : ..." dans la description. Les recos generiques sectorielles sont en queue de liste, jamais dans le top 3. Aucune ne doit contenir le jargon liste plus haut. Reponds UNIQUEMENT avec le JSON.`,
  };
}
