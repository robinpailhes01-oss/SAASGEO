// =====================================================================
// Service de fetch des requetes manuelles d'un audit (queries.source =
// 'user'). Retourne un payload structure pour l'API GET et le polling
// frontend. PURE READ : ne touche jamais audit_scores ni le pipeline
// principal.
//
// SERVER-ONLY — utilise createAdminClient. Ne pas importer depuis un
// composant client.
// =====================================================================

import { createAdminClient } from "@/lib/supabase/server";
import {
  PROVIDER_COLORS,
  PROVIDER_LABELS,
  type AIProvider,
  type ManualQueriesPayload,
  type ManualQueryResult,
  MANUAL_QUERIES_MAX,
} from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PROVIDERS_EXPECTED: AIProvider[] = [
  "openai",
  "anthropic",
  "perplexity",
  "gemini",
];

// Tronque defensivement une chaine au dernier espace avant `max` chars.
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > max * 0.7 ? slice.slice(0, lastSpace) : slice).trimEnd() + "…";
}

// Recupere les manual queries pour un audit + leurs analyses.
// Renvoie null si l'audit n'existe pas (404 cote API).
export async function getManualQueries(
  auditId: string
): Promise<ManualQueriesPayload | null> {
  if (!UUID_RE.test(auditId)) return null;

  const sb = createAdminClient();

  // Verif que l'audit existe (avant de tirer les jointures inutiles)
  const { data: audit } = await sb
    .from("audits")
    .select("id")
    .eq("id", auditId)
    .maybeSingle();
  if (!audit) return null;

  // Recupere uniquement les queries source='user' pour ce audit.
  const { data: userQueries } = await sb
    .from("queries")
    .select("id, text, position, created_at")
    .eq("audit_id", auditId)
    .eq("source", "user")
    .order("position", { ascending: true });

  const queryRows = userQueries ?? [];
  if (queryRows.length === 0) {
    return {
      count: 0,
      remaining: MANUAL_QUERIES_MAX,
      queries: [],
      pending: false,
    };
  }

  const queryIds = queryRows.map((q) => q.id);

  // Recupere les ai_responses + analyses pour ces queries
  const { data: responses } = await sb
    .from("ai_responses")
    .select("id, provider, query_id, raw_response")
    .in("query_id", queryIds);
  const responseRows = responses ?? [];
  const responseIds = responseRows.map((r) => r.id);

  const analyses =
    responseIds.length > 0
      ? (
          await sb
            .from("ai_response_analysis")
            .select(
              "response_id, brand_mentioned, competitors_cited"
            )
            .in("response_id", responseIds)
        ).data ?? []
      : [];
  const analysesByResponseId = new Map(
    analyses.map((a) => [a.response_id, a])
  );

  // Reorganise par query_id pour le rendu
  const responsesByQueryId = new Map<
    string,
    Array<{
      provider: AIProvider;
      raw_response: string | null;
      analysis: { brand_mentioned: boolean; competitors_cited: string[] } | null;
    }>
  >();
  for (const r of responseRows) {
    const list = responsesByQueryId.get(r.query_id) ?? [];
    const a = analysesByResponseId.get(r.id);
    list.push({
      provider: r.provider as AIProvider,
      raw_response: r.raw_response,
      analysis: a
        ? {
            brand_mentioned: !!a.brand_mentioned,
            competitors_cited: Array.isArray(a.competitors_cited)
              ? a.competitors_cited
              : [],
          }
        : null,
    });
    responsesByQueryId.set(r.query_id, list);
  }

  let anyPending = false;
  const results: ManualQueryResult[] = queryRows.map((q) => {
    const respList = responsesByQueryId.get(q.id) ?? [];
    // Une query est pending tant que les 4 IA n'ont pas TOUTES une
    // analyse persistee (response existe + analysis existe).
    const completedCount = respList.filter((r) => r.analysis !== null).length;
    const pending = completedCount < PROVIDERS_EXPECTED.length;
    if (pending) anyPending = true;

    const responsesPayload = respList
      .filter((r) => r.analysis !== null)
      .map((r) => {
        const full = (r.raw_response ?? "").trim();
        return {
          provider: r.provider,
          provider_label: PROVIDER_LABELS[r.provider],
          provider_color: PROVIDER_COLORS[r.provider],
          brand_mentioned: r.analysis!.brand_mentioned,
          competitors_cited: r.analysis!.competitors_cited.slice(0, 5),
          response_preview: truncate(full, 200),
          response_full: full,
        };
      })
      // Ordre stable : ChatGPT, Claude, Perplexity, Gemini
      .sort(
        (a, b) =>
          PROVIDERS_EXPECTED.indexOf(a.provider) -
          PROVIDERS_EXPECTED.indexOf(b.provider)
      );

    return {
      query_id: q.id,
      query_text: q.text,
      pending,
      responses: responsesPayload,
    };
  });

  return {
    count: results.length,
    remaining: Math.max(0, MANUAL_QUERIES_MAX - results.length),
    queries: results,
    pending: anyPending,
  };
}
