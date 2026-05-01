// =====================================================================
// Routing : selectionne le bon adapter selon le modele demande +
// la config (GEMINI_API_KEY pour le free tier, OPENROUTER_API_KEY
// pour le reste).
//
// Fallback chain pour Gemini (si GEMINI_API_KEY set) :
//   1. tentative Gemini direct
//   2. si 503/429 : retry exponentiel 1s, 2s, 4s (max 3 retries)
//   3. si toujours en echec : fallback OpenRouter Gemini
//
// Toutes les couches superieures (orchestrator, visibility tracker,
// prompts) utilisent generateText() depuis ce fichier — elles
// n'ont pas a se soucier de quel adapter est utilise sous le capot.
// =====================================================================

import type { GenerateTextOptions, GenerateTextResult } from "../types";
import { callOpenRouter } from "./openrouter";
import {
  callGeminiDirect,
  isGeminiDirectAvailable,
  GeminiDirectError,
} from "./gemini-direct";

const RETRY_DELAYS_MS = [1000, 2000, 4000]; // backoff exponentiel

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// Tente Gemini direct avec retry exponentiel sur erreurs temporaires.
// Si tous les retries echouent, throws (le caller decidera du fallback).
async function callGeminiDirectWithRetry(
  model: string,
  opts: GenerateTextOptions,
  verbose = false
): Promise<GenerateTextResult> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await callGeminiDirect(model, opts);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      const isRetryable =
        e instanceof GeminiDirectError && e.isRetryable;
      if (!isRetryable || attempt >= RETRY_DELAYS_MS.length) {
        throw lastError;
      }
      const delay = RETRY_DELAYS_MS[attempt];
      if (verbose) {
        console.warn(
          `  [providers] Gemini ${e instanceof GeminiDirectError ? e.status : "?"}, retry ${attempt + 1}/${RETRY_DELAYS_MS.length} dans ${delay}ms`
        );
      }
      await sleep(delay);
    }
  }
  throw lastError ?? new Error("Gemini direct epuise les retries");
}

// Genere du texte via le bon adapter avec fallback intelligent.
// - Gemini : direct + retry, fallback OpenRouter si echec
// - Tout le reste : OpenRouter direct (avec retry intra-OpenRouter)
export async function generateText(
  model: string,
  opts: GenerateTextOptions
): Promise<GenerateTextResult> {
  const verbose = process.env.ANKORA_VERBOSE === "1";

  // Routing Gemini direct si possible
  if (model.startsWith("google/") && isGeminiDirectAvailable()) {
    try {
      return await callGeminiDirectWithRetry(model, opts, verbose);
    } catch (e) {
      const status = e instanceof GeminiDirectError ? e.status : 0;
      if (verbose) {
        console.warn(
          `  [providers] Gemini direct echec definitif (status ${status}), fallback OpenRouter`
        );
      }
      // Fallback : OpenRouter Gemini (quota separe du free tier Google)
      return await callOpenRouter(model, opts);
    }
  }

  return callOpenRouter(model, opts);
}

// Re-exports utiles pour les tests / debugging
export { callOpenRouter, OpenRouterError } from "./openrouter";
export {
  callGeminiDirect,
  isGeminiDirectAvailable,
  GeminiDirectError,
} from "./gemini-direct";
