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

// =====================================================================
// Bloc Evolution — comparaison "vs precedent" pour le meme domaine
// =====================================================================

// Presence par categorie sur les 30 queries 'generated' standard.
// Une query "compte" si AU MOINS une des 4 IA cite la marque.
export type PresenceByCategory = {
  branded: number; // 0..10
  service: number;
  comparative: number;
};

// Snapshot precedent (depuis audit_history) — null si premier audit
// pour ce domaine.
export type PreviousSnapshot = {
  computed_at: string;
  global_score: number | null;
  mention_rate: number | null;
  presence_branded: number;
  presence_service: number;
  presence_comparative: number;
  scores_per_provider: Record<AIProvider, number>;
};

// Delta entre snapshot courant et precedent. Champs nullables si non
// applicables (ex: queries_delta=null si overlap < 5).
export type EvolutionDelta = {
  global_score: number | null;       // courant - precedent
  mention_rate: number | null;
  presence_branded: number;
  presence_service: number;
  presence_comparative: number;
  scores_per_provider: Record<AIProvider, number>;
  // Liste des query_texts (deja affichables, pas normalises) ou la
  // marque est citee MAINTENANT mais pas avant.
  queries_gained: string[] | null;
  // Idem mais a l'inverse : etait cite, ne l'est plus.
  queries_lost: string[] | null;
};

export type EvolutionPayload = {
  presence_per_category: PresenceByCategory;
  previous: PreviousSnapshot | null;
  delta: EvolutionDelta | null;
};

// =====================================================================
// Toutes les questions testees — bloc collapsible "30 questions"
// =====================================================================

// Niveau geographique d'une query, classe a partir du texte par
// matching insensible a la casse contre business.city_main / city /
// region. national = aucun match, queries sans ancrage local.
export type QueryGeoLevel =
  | "city_main" // ex: contient "Montpellier" (grande ville reference)
  | "city_exact" // ex: contient "Carnon" (ville exacte)
  | "region" // ex: contient "Hérault" / "Occitanie"
  | "national"; // aucun match, queries sectorielles ou branded sans geo

// Une ligne du bloc "Toutes les questions testees" : query +
// agregat des 4 IA (brand_mentioned + concurrent principal cite si
// la marque est absente).
export type AllQueryRow = {
  query_id: string;
  text: string;
  category: QueryCategory;
  position: number;
  geo_level: QueryGeoLevel;
  // True si AU MOINS 1 IA des 4 cite la marque pour cette query.
  brand_mentioned: boolean;
  // Concurrent le plus cite dans les 4 reponses de cette query (le 1er
  // par frequence). null si la marque est citee OU si aucun concurrent
  // n'est cite. Permet d'afficher "Concurrent X cite a votre place"
  // pour les queries ratees.
  top_competitor: string | null;
};

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
  // city_main : grande ville de reference (>50k hab) la plus proche.
  // Ex: city='Carnon' -> city_main='Montpellier'. Resolu en backend
  // par lib/ai/city-resolver. Sert d'eyebrow "Zone {city_main}" et de
  // pivot pour 50% des queries generees.
  city_main: string | null;
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
  // Nombre de reponses qui composent la base de calcul du score
  // (= scoreAnalyses) : non-branded + (si scope=local) matchant
  // city_main/city/region. Utilise comme denominateur dans le podium
  // TopCompetitors pour assurer la coherence avec le score affiche.
  // Avant cette refonte, le podium utilisait total_queries * 4 (= 120)
  // ce qui creait une asymetrie : un concurrent 18/120 (sur questions
  // non-pertinentes pour le score) masquait que la marque etait
  // 4/N sur la VRAIE base (questions service+comparative locales).
  score_base_responses_count: number;

  // -- Phase D.2 : top 3 concurrents + apercus IA --
  top_competitors: CompetitorRanking[]; // 0..3 entrees
  // Plateformes/concurrents qui DEPASSENT la marque sur les requetes
  // mentionnant city_main (Montpellier dans l'exemple Carnon). Ce sont
  // typiquement des plateformes nationales (Click&Boat, SamBoat,
  // Booking.com) qui captent les requetes a fort volume — alors que
  // le podium principal ci-dessus reflete le classement TOTAL
  // (toutes requetes confondues). Exclut deja les noms du top 3 podium
  // pour eviter les doublons. Vide si city_main absent ou si la marque
  // domine deja sur city_main.
  city_main_platforms_above_brand: CompetitorRanking[]; // 0..3 entrees
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

  // -- Bloc Evolution : presence par categorie + delta vs precedent --
  evolution: EvolutionPayload;

  // -- Bloc "Toutes les questions testees" (collapsible) --
  // Liste des 30 queries source='generated' avec agregat des 4 IA.
  // Les manual queries (source='user') sont exclues — elles ont leur
  // propre bloc ManualQueries.
  all_queries: AllQueryRow[];
};

// Helper UI : retourne le ton selon le score (rouge/orange/vert).
export type ScoreTone = "low" | "medium" | "high";
export function scoreTone(score: number): ScoreTone {
  if (score < 40) return "low";
  if (score < 70) return "medium";
  return "high";
}

// =====================================================================
// Phase manual-queries — requetes ajoutees manuellement par le client
// apres avoir vu le rapport. Max 3 par audit, isolees du score officiel.
// =====================================================================

// Limite stricte cote API + UI. Ne pas augmenter sans repenser
// le caveat anti-biais et le coût (~0.027 € par query supplementaire).
export const MANUAL_QUERIES_MAX = 3;

// Resultat d'une query manuelle apres processing par les 4 IA. PAS de
// score agrege — on affiche brut par IA (oui/non + concurrents) pour
// eviter de donner au client un chiffre biaise a brandir.
export type ManualQueryResult = {
  query_id: string;
  query_text: string;
  // Si true : query inseree mais analyses pas encore completes (polling).
  pending: boolean;
  // 0 a 4 entrees (une par IA qui a deja repondu)
  responses: Array<{
    provider: AIProvider;
    provider_label: string;
    provider_color: string;
    brand_mentioned: boolean;
    competitors_cited: string[];
    response_preview: string;  // tronque ~200 chars
    response_full: string;
  }>;
};

// Payload renvoye par GET /api/audits/[id]/manual-queries.
export type ManualQueriesPayload = {
  count: number;            // 0..3
  remaining: number;        // MANUAL_QUERIES_MAX - count
  queries: ManualQueryResult[];
  // True tant qu'au moins une query n'a pas ses 4 analyses.
  pending: boolean;
};

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
