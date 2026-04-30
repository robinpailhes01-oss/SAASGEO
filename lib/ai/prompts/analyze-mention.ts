// =====================================================================
// Prompt : analyse d'une reponse IA pour detecter mention, sentiment,
// concurrents cites et sources.
// Modele cible : Claude Haiku 4.5 (cout ~0.001€/reponse, batch possible).
//
// Strategie a 3 couches (cf. spec Phase 0) :
//   1. Match exact + fuzzy (dans lib/ai/detection/brand-mention.ts) → pre-filtre
//   2. Si exact fail : LLM verifier (ce prompt)
//   3. Aggregation des resultats dans ai_response_analysis
// =====================================================================

import { z } from "zod";

export const MentionAnalysisSchema = z.object({
  brand_mentioned: z
    .boolean()
    .describe(
      "True si la marque (nom officiel ou variante) est mentionnee textuellement dans la reponse"
    ),
  mention_position: z
    .number()
    .int()
    .min(0)
    .nullable()
    .describe(
      "Position de la marque parmi les businesses cites (1 = premier cite, 2 = deuxieme, etc.). null si non mentionnee."
    ),
  mention_context: z
    .string()
    .nullable()
    .describe("Snippet de texte autour de la mention (200 chars max). null si non mentionnee."),
  brand_citation_present: z
    .boolean()
    .describe("True si la reponse cite explicitement une URL/source du site de la marque"),
  sentiment: z
    .enum(["positive", "neutral", "negative"])
    .nullable()
    .describe("Sentiment exprime envers la marque dans la reponse. null si non mentionnee."),
  competitors_cited: z
    .array(z.string())
    .describe("Liste des concurrents mentionnes (autres marques du meme secteur)"),
  sources_cited: z
    .array(z.string())
    .describe("Liste des sources/URLs explicitement citees dans la reponse"),
});

export type MentionAnalysis = z.infer<typeof MentionAnalysisSchema>;

export function buildMentionAnalysisPrompt(args: {
  brand_name: string;
  brand_aliases: string[];
  query: string;
  ai_response: string;
}): { system: string; prompt: string } {
  return {
    system: `Tu es un analyste de contenu specialise dans la detection de mentions de marque dans des reponses d'IA conversationnelles.
Tu reponds UNIQUEMENT avec un JSON valide matchant le schema demande.
Sois strict : "mentioned" = la marque est NOMMEE textuellement (ou via une variante listee), pas juste implicite.`,
    prompt: `Analyse la reponse IA suivante pour detecter la mention de la marque "${args.brand_name}" (variantes : ${args.brand_aliases.join(", ") || "aucune"}).

Requete posee a l'IA : "${args.query}"

Reponse IA a analyser :
---
${args.ai_response.slice(0, 4000)}
---

Format de reponse JSON :

{
  "brand_mentioned": boolean,
  "mention_position": number | null (1 = premier business cite, etc.),
  "mention_context": "string | null (200 chars max autour de la mention)",
  "brand_citation_present": boolean (URL/source du site de la marque cite),
  "sentiment": "positive" | "neutral" | "negative" | null,
  "competitors_cited": ["array de noms de concurrents detectes"],
  "sources_cited": ["array d'URLs ou de sources nommees explicitement"]
}

Reponds UNIQUEMENT avec le JSON, sans texte autour.`,
  };
}
