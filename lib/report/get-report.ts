// =====================================================================
// Service d'agregation du rapport d'audit (SERVER-ONLY).
//
// Une seule fonction `getReport(auditId)` qui ramene tout ce dont la
// page rapport a besoin (D.1 -> D.4) en parallele. Renvoie null si
// l'audit n'existe pas, ou un payload avec `status` non-done si
// l'audit n'est pas encore termine (la page server route alors vers
// /progress).
//
// On utilise createAdminClient (service_role) pour bypass RLS — la
// page rapport est publique par design (UUID v4 unguessable).
//
// Les types et helpers UI sont dans lib/report/types.ts (importable
// par les Client Components).
// =====================================================================

import { createAdminClient } from "@/lib/supabase/server";
import {
  PROVIDER_COLORS,
  PROVIDER_LABELS,
  PROVIDER_ORDER,
  type ProviderScore,
  type ReportData,
} from "./types";

export type { ReportData, ProviderScore } from "./types";
export { scoreTone, PROVIDER_LABELS, PROVIDER_COLORS, PROVIDER_ORDER } from "./types";

function prettyHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Parse defensif du JSON visibility_per_provider — au cas ou le format
// stocke serait legerement different selon la version du pipeline.
function parsePerProvider(raw: unknown): ProviderScore[] {
  if (!raw || typeof raw !== "object") {
    return PROVIDER_ORDER.map((p) => ({
      provider: p,
      label: PROVIDER_LABELS[p],
      color: PROVIDER_COLORS[p],
      score: 0,
    }));
  }
  const obj = raw as Record<string, unknown>;
  return PROVIDER_ORDER.map((p) => {
    const v = obj[p];
    const score =
      typeof v === "number" && Number.isFinite(v)
        ? Math.max(0, Math.min(100, Math.round(v)))
        : 0;
    return {
      provider: p,
      label: PROVIDER_LABELS[p],
      color: PROVIDER_COLORS[p],
      score,
    };
  });
}

// Recupere tout le rapport en une fois.
export async function getReport(auditId: string): Promise<ReportData | null> {
  // Validation UUID basique pour eviter les selects parasites
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      auditId
    )
  ) {
    return null;
  }

  const sb = createAdminClient();

  // Etape 1 : audit + scores + business + queries (parallele).
  const [auditRes, scoresRes, businessRes, queriesRes] = await Promise.all([
    sb
      .from("audits")
      .select("id, url, status, completed_at")
      .eq("id", auditId)
      .maybeSingle(),
    sb
      .from("audit_scores")
      .select(
        "global_score, technical_score, visibility_score, mention_rate, citation_rate, top_competitor, visibility_per_provider"
      )
      .eq("audit_id", auditId)
      .maybeSingle(),
    sb
      .from("audit_business_info")
      .select("brand_name, industry, geo_zone")
      .eq("audit_id", auditId)
      .maybeSingle(),
    sb.from("queries").select("id").eq("audit_id", auditId),
  ]);

  if (auditRes.error || !auditRes.data) return null;

  const audit = auditRes.data;
  const scores = scoresRes.data;
  const business = businessRes.data;
  const queryIds = (queriesRes.data ?? []).map((q) => q.id);
  const total_queries = queryIds.length;

  // Etape 2 : analyses sur les ai_responses liees a ces queries.
  // On split en deux passes (responses puis analyses) pour eviter une
  // jointure imbriquee qui complique les types PostgREST.
  let total_responses = 0;
  let brand_mentions_count = 0;
  if (queryIds.length > 0) {
    const { data: responses } = await sb
      .from("ai_responses")
      .select("id")
      .in("query_id", queryIds);
    const responseIds = (responses ?? []).map((r) => r.id);
    if (responseIds.length > 0) {
      const { data: analyses } = await sb
        .from("ai_response_analysis")
        .select("brand_mentioned")
        .in("response_id", responseIds);
      const rows = analyses ?? [];
      total_responses = rows.length;
      brand_mentions_count = rows.filter((a) => a.brand_mentioned).length;
    }
  }

  return {
    audit_id: audit.id,
    url: audit.url,
    hostname: prettyHostname(audit.url),
    status: audit.status,
    completed_at: audit.completed_at,

    brand_name: business?.brand_name ?? prettyHostname(audit.url),
    industry: business?.industry ?? null,
    geo_zone: business?.geo_zone ?? null,

    global_score: scores?.global_score ?? 0,
    technical_score: scores?.technical_score ?? 0,
    visibility_score: scores?.visibility_score ?? 0,
    mention_rate:
      typeof scores?.mention_rate === "number" ? scores.mention_rate : null,
    citation_rate:
      typeof scores?.citation_rate === "number" ? scores.citation_rate : null,
    per_provider: parsePerProvider(scores?.visibility_per_provider),
    top_competitor: scores?.top_competitor ?? null,

    total_queries,
    total_responses,
    brand_mentions_count,
  };
}
