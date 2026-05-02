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
- "+X points" "score" "metric" "KPI" -> traduit en "+X clients/mois estimes" ou "+X recherches captees"
- "API" "endpoint" "JSON" "code"      -> reformule sans jargon technique

REGLES STRICTES POUR LES RECOMMANDATIONS :
1. Chaque recommandation est ecrite POUR ${input.brand_name}, en parlant a son dirigeant. Pas "il faut", mais "vous gagnerez", "vous perdez", "creez", "ajoutez".
2. Au moins 3 recommandations sur 5 doivent NOMINATIVEMENT citer un concurrent reel detecte (parmi top_competitors_observed) OU une question precise manquee (parmi missed_opportunities).
3. Si applicable, ajoute "Pas besoin de developpeur" ou "Faisable sans technicien" pour rassurer.
4. Format obligatoire :
   - title (max 80 chars) = LE CONSTAT factuel : "[Concurrent] apparait a votre place sur '[query]'" ou "Vous n'apparaissez pas sur '[theme]'".
   - description (max 300 chars) = L'ACTION en francais simple, sans jargon. Pas plus de 2 phrases.
5. INTERDIT generique : "Ameliorez votre presence", "Optimisez votre referencement", "Travaillez votre marque" -> rejete sans appel.
6. ACCEPTE personnalise : "Hotel de la Plage capte 'sejour romantique ${locationLabel ?? "votre ville"}' a votre place — creez une page sur votre site qui repond exactement a cette question. Pas besoin de developpeur."

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
  .join("\n")}${missedBlock}

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

Genere entre 5 et 15 recommandations. Quick wins en premier (impact eleve / effort faible). Au moins 3 recommandations DOIVENT etre personnalisees (citent un concurrent ou une query manquee). Aucune ne doit contenir le jargon liste plus haut. Reponds UNIQUEMENT avec le JSON.`,
  };
}
