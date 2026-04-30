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
  technical_score: number;       // /100
  visibility_score: number;      // /100
  visibility_per_provider: Record<string, number>;
  mention_rate: number;          // 0-100
  citation_rate: number;         // 0-100
  top_competitors_observed: string[];
  failed_tech_checks: { label: string; recommendation?: string }[];
  passed_tech_checks_count: number;
  total_tech_checks: number;
}

export function buildSynthesisPrompt(input: SynthesisInput): {
  system: string;
  prompt: string;
} {
  return {
    system: `Tu es un consultant senior en GEO (Generative Engine Optimization) specialise dans le tourisme et l'hotellerie en France.
Tu produis des verdicts factuels (chiffres a l'appui) et des recommandations concretes, jamais generiques.
Tu reponds UNIQUEMENT avec un JSON valide matchant le schema demande.`,
    prompt: `Synthetise l'audit GEO du business suivant :

Marque : ${input.brand_name}
Secteur : ${input.industry ?? "non precise"}

SCORES :
- Score technique : ${input.technical_score}/100
- Score visibility IA : ${input.visibility_score}/100
- Taux de mention textuelle : ${input.mention_rate.toFixed(1)}%
- Taux de citation source : ${input.citation_rate.toFixed(1)}%

VISIBILITE PAR PROVIDER (sur 100) :
${Object.entries(input.visibility_per_provider)
  .map(([p, s]) => `  - ${p} : ${s}/100`)
  .join("\n")}

CONCURRENTS QUI APPARAISSENT LE PLUS a votre place dans les reponses IA :
${input.top_competitors_observed.length > 0 ? input.top_competitors_observed.slice(0, 5).map((c) => `  - ${c}`).join("\n") : "  (aucun concurrent identifie)"}

CHECKS TECHNIQUES :
- ${input.passed_tech_checks_count} pass / ${input.total_tech_checks} total
- Top fails :
${input.failed_tech_checks
  .slice(0, 10)
  .map((c) => `  - ${c.label}${c.recommendation ? ` → ${c.recommendation.slice(0, 100)}` : ""}`)
  .join("\n")}

Format de reponse JSON :

{
  "verdict": "Phrase courte (1-2 lignes) qui resume la situation avec des chiffres. Doit etre brutal et factuel, pas du blabla.",
  "top_competitor": "string ou null — le concurrent qui ressort le plus",
  "recommendations": [
    {
      "priority": "quick_win" | "medium" | "long_term",
      "category": "string courte",
      "title": "Action courte (max 80 chars)",
      "description": "Action concrete (max 300 chars). Ne dis pas 'ameliorer le SEO' — dis 'creer un robots.txt avec User-agent: GPTBot Allow: /'",
      "impact_score": 1-10
    }
  ]
}

Genere entre 5 et 15 recommandations. Quick wins en premier (impact eleve / effort faible). Reponds UNIQUEMENT avec le JSON.`,
  };
}
