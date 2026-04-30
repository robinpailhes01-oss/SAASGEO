// =====================================================================
// Mapping AIProvider (notre enum interne) -> nom du modele OpenRouter
// a utiliser pour chaque cas d'usage.
//
// Visibility tracking : le modele utilise doit refleter ce qu'un user
// lambda obtiendrait via le chat de chaque IA. Donc :
//   - openai     -> openai/gpt-4o            (modele par defaut ChatGPT)
//   - anthropic  -> anthropic/claude-sonnet-4-5 (modele par defaut Claude.ai)
//   - perplexity -> perplexity/sonar         (avec citations Web)
//   - gemini     -> google/gemini-2.5-flash  (modele par defaut gemini.google.com)
//
// Tasks internes (extraction, generation, analyse, synthese) :
// modeles "fast & cheap" pour controler les couts. On utilise Haiku
// principalement (efficace + bon JSON mode).
// =====================================================================

import type { AIProvider, RequestType } from "./types";

// Modeles utilises pour le visibility tracking (1 modele par provider).
// Doit etre stocke dans ai_responses.model pour la reproductibilite.
export const VISIBILITY_MODELS: Record<AIProvider, string> = {
  openai: "openai/gpt-4o",
  anthropic: "anthropic/claude-sonnet-4-5",
  perplexity: "perplexity/sonar",
  gemini: "google/gemini-2.5-flash",
};

// Modeles utilises pour les tasks internes (par RequestType).
// Tous via OpenRouter sauf le visibility tracking (qui boucle sur
// VISIBILITY_MODELS).
export const TASK_MODELS: Record<
  Exclude<RequestType, "visibility_query" | "test">,
  string
> = {
  brand_extraction: "anthropic/claude-haiku-4-5",
  queries_generation: "anthropic/claude-sonnet-4-5",
  mention_analysis: "anthropic/claude-haiku-4-5",
  synthesis: "anthropic/claude-sonnet-4-5",
};

// Helper : pour un nom de modele OpenRouter, retourne le AIProvider
// correspondant pour le tracking dans api_usage / ai_responses.
export function modelToProvider(model: string): AIProvider {
  if (model.startsWith("openai/")) return "openai";
  if (model.startsWith("anthropic/")) return "anthropic";
  if (model.startsWith("perplexity/")) return "perplexity";
  if (model.startsWith("google/")) return "gemini";
  // Default fallback : on assigne a openai pour ne pas crasher
  // (mais on log pour pouvoir corriger)
  console.warn(`[models] Provider inconnu pour ${model}, fallback openai`);
  return "openai";
}
