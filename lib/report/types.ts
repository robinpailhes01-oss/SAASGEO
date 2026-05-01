// =====================================================================
// Types et helpers PUR du rapport (pas d'import server-only).
//
// Ce fichier est volontairement separe de get-report.ts (qui importe
// lib/supabase/server -> next/headers, donc reserve aux Server
// Components). Les composants client peuvent ici importer types et
// helpers UI sans tirer le bundle serveur.
// =====================================================================

import type { Database } from "@/lib/supabase/types";

export type AIProvider = Database["public"]["Enums"]["ai_provider"];

// Cle d'affichage pour les 4 IA — on garde le label "consumer" cote UI
// (ChatGPT plutot qu'OpenAI) tout en mappant l'enum DB.
export const PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: "ChatGPT",
  anthropic: "Claude",
  perplexity: "Perplexity",
  gemini: "Gemini",
};

// Couleurs officielles (cf. AILogos.tsx) — utilisees pour les sous-
// scores et les pictos de marque.
export const PROVIDER_COLORS: Record<AIProvider, string> = {
  openai: "#10A37F",
  anthropic: "#D97757",
  perplexity: "#20808D",
  gemini: "#4285F4",
};

// L'ordre d'affichage : ChatGPT en premier (notoriete), puis les autres
export const PROVIDER_ORDER: AIProvider[] = [
  "openai",
  "anthropic",
  "perplexity",
  "gemini",
];

export type ProviderScore = {
  provider: AIProvider;
  label: string;
  color: string;
  score: number; // 0-100
};

// Sous-ensemble du payload utilise en Phase D.1.
// D.2/D.3/D.4 enrichiront le ReportData avec competitors, ai_responses,
// recommendations, etc. (extension non breaking : champs optionnels).
export type ReportData = {
  // -- Audit metadata --
  audit_id: string;
  url: string;
  hostname: string;
  status: Database["public"]["Enums"]["audit_status"];
  completed_at: string | null;

  // -- Identite business --
  brand_name: string;
  industry: string | null;
  geo_zone: string | null;

  // -- Scores --
  global_score: number;
  technical_score: number;
  visibility_score: number;
  mention_rate: number | null;
  citation_rate: number | null;
  per_provider: ProviderScore[];
  top_competitor: string | null;

  // -- Stats brutes pour les visuels narratifs --
  total_queries: number;
  total_responses: number;
  brand_mentions_count: number;
};

// Helper UI : retourne le ton selon le score (rouge/orange/vert).
export type ScoreTone = "low" | "medium" | "high";
export function scoreTone(score: number): ScoreTone {
  if (score < 40) return "low";
  if (score < 70) return "medium";
  return "high";
}
