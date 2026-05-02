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
    system: `Tu es un consultant senior en GEO (Generative Engine Optimization) en France.
Tu produis des verdicts factuels (chiffres a l'appui) et des recommandations PERSONNALISEES — JAMAIS generiques.

REGLES STRICTES POUR LES RECOMMANDATIONS :
1. Chaque recommandation doit etre directement actionnable par ${input.brand_name} — pas par "tout le monde".
2. Au moins 3 recommandations sur 5 doivent citer NOMINATIVEMENT un concurrent reel detecte (parmi top_competitors_observed) OU une question precise manquee (parmi missed_opportunities).
3. INTERDIT : "Ameliorez votre presence", "Optimisez votre SEO", "Travaillez votre marque" — ces formulations vagues sont rejetees.
4. ACCEPTE : "Creez une page '/sejour-romantique-${locationLabel ?? "[ville]"}' car Hotel de la Plage capte cette requete a votre place sur ChatGPT".
5. Le titre (max 80 chars) doit etre concret. La description (max 300 chars) doit donner l'action precise + l'argument chiffres ("vous ratez X questions sur 30 sur ce theme").

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
      "category": "string courte (ex: 'content', 'authority', 'GEO triptych')",
      "title": "Action courte et concrete (max 80 chars). Format prefere : 'Vous ratez \\"[query]\\"' OU 'Repondez a [concurrent] sur [theme]'",
      "description": "Action precise (max 300 chars). Doit citer soit une question manquee, soit un concurrent reel. Format : '[Constat factuel chiffre]. [Action precise et concrete a faire].'",
      "impact_score": 1-10
    }
  ]
}

Genere entre 5 et 15 recommandations. Quick wins en premier (impact eleve / effort faible). Au moins 3 recommandations DOIVENT etre personnalisees (citent un concurrent ou une query manquee). Reponds UNIQUEMENT avec le JSON.`,
  };
}
