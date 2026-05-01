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
// Echelle business detectee par le LLM Haiku (cf. brand-extract.ts).
// Drive (a) la generation de queries (50/30/20 si local), (b)
// l'affichage d'un bandeau de localisation dans le rapport.
export type BusinessScope = "local" | "national" | "international";

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
  // Localisation structuree (Phase localisation)
  city: string | null;
  region: string | null;
  country: string | null;
  business_scope: BusinessScope;

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

  // -- Phase D.2 : top 3 concurrents + apercus IA --
  top_competitors: CompetitorRanking[]; // 0..3 entrees
  // Nombre de reponses IA (sur total_queries * 4 = 120) ou la marque
  // est mentionnee. MEME base que competitor.mentions pour assurer
  // une comparaison juste sur le podium TopCompetitors. Avant cette
  // refonte (Phase localisation), c'etait une autre metrique sur 30,
  // ce qui creait une asymetrie visuelle (concurrent 18/120, vous 10/30).
  your_mentions_count: number;
  samples: AIResponseSample[]; // 0..2 apercus

  // -- Phase D.3 : pourquoi invisible + actions prioritaires --
  why_reasons: WhyReason[]; // exactement 3 (technique + notoriete + contenu)
  recommendations: RecommendationsSummary;
};

// Helper UI : retourne le ton selon le score (rouge/orange/vert).
export type ScoreTone = "low" | "medium" | "high";
export function scoreTone(score: number): ScoreTone {
  if (score < 40) return "low";
  if (score < 70) return "medium";
  return "high";
}

// =====================================================================
// Phase D.2 — Top 3 concurrents + apercus de reponses IA
// =====================================================================

export type QueryCategory = Database["public"]["Enums"]["query_category"];

// Une entree du podium concurrents
export type CompetitorRanking = {
  name: string; // nom canonique pour l'affichage (ex: "Stripe")
  mentions: number; // nombre total d'analyses qui le citent
  pct_of_queries: number; // % sur le total de queries (0-100)
};

// Un apercu de reponse IA pour le bloc 5
export type AIResponseSample = {
  id: string; // ai_responses.id
  provider: AIProvider;
  provider_label: string; // "ChatGPT" / "Claude" / etc.
  provider_color: string;
  query_text: string;
  query_category: QueryCategory;
  response_preview: string; // tronque a ~250 chars (avec ellipsis si tronque)
  response_full: string; // texte integral pour le Dialog
  brand_mentioned: boolean;
  competitors_cited: string[]; // noms canoniques presents dans la reponse
};

// Normalise un nom de concurrent pour l'agregation par cle.
// Lowercase + trim + retire prefixes URL et suffixes de domaine courants.
export function normalizeCompetitorKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\.(com|fr|io|co|app|ai|net|org)$/, "");
}

// =====================================================================
// Phase D.3 — Pourquoi invisible + actions prioritaires
// =====================================================================

// Une raison du Bloc 6 : 3 cards verticales (technique / notoriete / contenu).
export type WhyReason = {
  slot: "technical" | "authority" | "content";
  title: string;
  subtitle: string;
};

// Une action du Bloc 7 : top 3 a partir des audit_recommendations.
export type PriorityAction = {
  position: number; // 1, 2, 3
  title: string;
  description: string; // tronque a ~120 chars
  impact_label: string; // "+15 points en 30 jours"
};

// Compte total de recommandations (pour le footer "Plan complet de N actions").
export type RecommendationsSummary = {
  top3: PriorityAction[];
  total_count: number;
};
