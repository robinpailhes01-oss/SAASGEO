// =====================================================================
// Types partages pour la couche AI (providers, cost tracking, prompts)
// =====================================================================

import type { Database } from "@/lib/supabase/types";

// Fournisseurs supportes — alignes avec l'enum Postgres ai_provider
export type AIProvider = Database["public"]["Enums"]["ai_provider"];

// Type d'usage logge dans api_usage.request_type
export type RequestType =
  | "brand_extraction"      // 1 appel/audit (Haiku)
  | "queries_generation"    // 1 appel/audit (Sonnet)
  | "visibility_query"      // 30 appels/audit/provider
  | "mention_analysis"      // ~30 appels/audit (Haiku batch)
  | "synthesis"             // 1 appel/audit (Sonnet)
  | "test";

// Modele pricing : couts en USD pour 1M tokens
export interface ModelPricing {
  provider: AIProvider;
  model: string;
  pricing_in_usd_per_1m: number;
  pricing_out_usd_per_1m: number;
  // Frais fixes par requete (Perplexity Sonar uniquement)
  request_fee_usd?: number;
}

// Options pour un appel LLM generique
export interface GenerateTextOptions {
  // System prompt (optionnel, par defaut vide pour les visibility queries)
  system?: string;
  // User prompt (obligatoire)
  prompt: string;
  // Temperature, par defaut 0.7 (realiste pour la visibility tracking)
  temperature?: number;
  maxTokens?: number;
  // Force la reponse en JSON (mode json_object pour OpenAI/Anthropic)
  jsonMode?: boolean;
}

// Resultat normalise quel que soit le provider
export interface GenerateTextResult {
  text: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  cost_eur: number;
  latency_ms: number;
  model: string;
  // Citations / sources renvoyees par le provider (Perplexity, Gemini)
  sources?: Array<{ title?: string; url: string }>;
  // Reponse brute pour debugging
  raw?: unknown;
}

// Interface commune a tous les providers
export interface AIProviderClient {
  readonly name: AIProvider;
  // Appel principal de generation
  generateText(
    opts: GenerateTextOptions,
    model?: string
  ): Promise<GenerateTextResult>;
}

// Resultat d'un check budget (utilise par budget-guard)
export interface BudgetStatus {
  // Total deja depense ce mois (somme des 4 providers)
  current_total_eur: number;
  // Cap configure (par defaut 90€)
  cap_eur: number;
  // Budget restant
  remaining_eur: number;
  // Niveau d'alerte courant
  alert_level: "ok" | "warning" | "critical" | "blocked";
  // Cout estime du prochain audit (par defaut 1.20€)
  estimated_audit_cost_eur: number;
  // True si on peut lancer un nouvel audit sans depasser le cap
  can_run_audit: boolean;
}
