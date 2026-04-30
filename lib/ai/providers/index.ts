// =====================================================================
// Routing : selectionne le bon adapter selon le modele demande +
// la config (GEMINI_API_KEY pour le free tier, OPENROUTER_API_KEY
// pour le reste).
//
// Toutes les couches superieures (orchestrator, visibility tracker,
// prompts) utilisent generateText() depuis ce fichier — elles
// n'ont pas a se soucier de quel adapter est utilise sous le capot.
// =====================================================================

import type { GenerateTextOptions, GenerateTextResult } from "../types";
import { callOpenRouter } from "./openrouter";
import { callGeminiDirect, isGeminiDirectAvailable } from "./gemini-direct";

// Genere du texte via le bon adapter.
// - Gemini : direct si GEMINI_API_KEY set (free tier), sinon OpenRouter
// - Tout le reste : OpenRouter
export async function generateText(
  model: string,
  opts: GenerateTextOptions
): Promise<GenerateTextResult> {
  // Routing Gemini direct si possible
  if (model.startsWith("google/") && isGeminiDirectAvailable()) {
    return callGeminiDirect(model, opts);
  }
  return callOpenRouter(model, opts);
}

// Re-exports utiles pour les tests / debugging
export { callOpenRouter, OpenRouterError } from "./openrouter";
export { callGeminiDirect, isGeminiDirectAvailable, GeminiDirectError } from "./gemini-direct";
