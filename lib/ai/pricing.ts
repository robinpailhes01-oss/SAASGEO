// =====================================================================
// Pricing constants des modeles LLM (avril 2026, USD/1M tokens)
//
// Sources :
//  - OpenAI : https://openai.com/api/pricing/
//  - Anthropic : https://www.anthropic.com/api (Console)
//  - Perplexity : https://docs.perplexity.ai/docs/getting-started/pricing
//  - Gemini : https://ai.google.dev/pricing
//
// A relire trimestriellement — les prix LLM bougent souvent.
// =====================================================================

import type { AIProvider, ModelPricing } from "./types";

// Modele par defaut pour chaque provider — utilise dans les visibility queries
// (= ce qu'un user lambda obtiendrait en chat free/payant)
export const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: "gpt-4o-2024-08-06",
  anthropic: "claude-sonnet-4-5",
  perplexity: "sonar",
  gemini: "gemini-2.5-flash",
};

// Modele "rapide et pas cher" — pour extraction, analyse, synthese
export const FAST_MODELS: Record<AIProvider, string> = {
  openai: "gpt-4o-mini-2024-07-18",
  anthropic: "claude-haiku-4-5-20251001",
  perplexity: "sonar",
  gemini: "gemini-2.5-flash",
};

// Table de pricing : USD par 1M tokens
export const PRICING: ModelPricing[] = [
  // ---- OpenAI ----
  {
    provider: "openai",
    model: "gpt-4o-2024-08-06",
    pricing_in_usd_per_1m: 2.5,
    pricing_out_usd_per_1m: 10.0,
  },
  {
    provider: "openai",
    model: "gpt-4o-mini-2024-07-18",
    pricing_in_usd_per_1m: 0.15,
    pricing_out_usd_per_1m: 0.6,
  },
  {
    provider: "openai",
    model: "gpt-4.1",
    pricing_in_usd_per_1m: 2.0,
    pricing_out_usd_per_1m: 8.0,
  },

  // ---- Anthropic ----
  {
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    pricing_in_usd_per_1m: 3.0,
    pricing_out_usd_per_1m: 15.0,
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    pricing_in_usd_per_1m: 3.0,
    pricing_out_usd_per_1m: 15.0,
  },
  {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    pricing_in_usd_per_1m: 1.0,
    pricing_out_usd_per_1m: 5.0,
  },

  // ---- Perplexity ----
  // sonar : 1$ in / 1$ out + ~5$/1k requetes (search context low)
  {
    provider: "perplexity",
    model: "sonar",
    pricing_in_usd_per_1m: 1.0,
    pricing_out_usd_per_1m: 1.0,
    request_fee_usd: 0.005, // 5$/1k requetes
  },
  {
    provider: "perplexity",
    model: "sonar-pro",
    pricing_in_usd_per_1m: 3.0,
    pricing_out_usd_per_1m: 15.0,
    request_fee_usd: 0.006,
  },

  // ---- Gemini ----
  {
    provider: "gemini",
    model: "gemini-2.5-flash",
    pricing_in_usd_per_1m: 0.3,
    pricing_out_usd_per_1m: 2.5,
  },
  {
    provider: "gemini",
    model: "gemini-2.5-pro",
    pricing_in_usd_per_1m: 1.25,
    pricing_out_usd_per_1m: 10.0,
  },
];

// Taux de change USD -> EUR. Hardcode pour MVP, peut etre raffraichi
// trimestriellement ou via une API si besoin.
export const USD_TO_EUR_RATE = 0.92;

export function getPricing(
  provider: AIProvider,
  model: string
): ModelPricing | null {
  return (
    PRICING.find((p) => p.provider === provider && p.model === model) ?? null
  );
}

// Calcule le cout en USD a partir des tokens
export function computeCostUsd(
  pricing: ModelPricing,
  tokens_in: number,
  tokens_out: number
): number {
  const inCost = (tokens_in / 1_000_000) * pricing.pricing_in_usd_per_1m;
  const outCost = (tokens_out / 1_000_000) * pricing.pricing_out_usd_per_1m;
  const reqFee = pricing.request_fee_usd ?? 0;
  return inCost + outCost + reqFee;
}

export function usdToEur(usd: number): number {
  return usd * USD_TO_EUR_RATE;
}
