// =====================================================================
// Persistance Supabase de l'audit complet.
//
// Pendant le pipeline runFullAudit() :
//   - createAudit()              : insert audits row au tout debut
//   - updateAuditStatus()        : update status + progress + current_step
//   - persistBusinessInfo()      : insert audit_business_info
//   - persistTechnicalChecks()   : insert audit_technical (5 categories)
//   - persistQueries()           : bulk insert queries[]
//   - persistAiResponses()       : bulk insert ai_responses[] + ai_response_analysis[]
//   - persistScores()            : insert audit_scores
//   - persistRecommendations()   : bulk insert audit_recommendations[]
//   - finalizeAudit()            : update status='done', progress=100, completed_at
//
// Tout via createAdminClient (service_role bypass RLS) — l'orchestrateur
// tourne cote serveur et ecrit pour le compte du user admin V0.
// =====================================================================

import { createAdminClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { TechAuditResult } from "@/lib/scraping/types";
import type { BusinessInfo } from "./prompts/brand-extract";
import type { Synthesis } from "./prompts/synthesis";
import { toQueryIdMap, lookupQueryId, type QueryIdMap } from "./query-id-map";
import type {
  VisibilityQuery,
  VisibilityResponse,
  VisibilityScores,
} from "./visibility-tracker";
import type { AIProvider } from "./types";

type DB = Database["public"]["Tables"];

function getAdminUserId(): string {
  const id = process.env.ADMIN_USER_ID;
  if (!id) {
    throw new Error(
      "ADMIN_USER_ID manquant dans .env.local. Cree le user admin via SQL et hardcode son UUID."
    );
  }
  return id;
}

// ---------------------------------------------------------------------
// Etape 0 : creation de la ligne audits
// ---------------------------------------------------------------------
export async function createAudit(args: {
  url: string;
  geo_target?: string | null;
  keywords?: string[];
  competitors?: string[];
}): Promise<string> {
  const sb = createAdminClient();
  const url_normalized = (() => {
    try {
      const u = new URL(args.url);
      return u.origin + u.pathname;
    } catch {
      return args.url;
    }
  })();

  const row: DB["audits"]["Insert"] = {
    user_id: getAdminUserId(),
    url: args.url,
    url_normalized,
    geo_target: args.geo_target ?? null,
    keywords: args.keywords && args.keywords.length > 0 ? args.keywords : [],
    competitors:
      args.competitors && args.competitors.length > 0 ? args.competitors : [],
    status: "queued",
    progress: 0,
    current_step: "Initialisation",
  };

  const { data, error } = await sb
    .from("audits")
    .insert(row)
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(
      `createAudit failed : ${error?.message ?? "no data returned"}`
    );
  }
  return data.id;
}

// ---------------------------------------------------------------------
// Update status + progress en cours d'audit
// ---------------------------------------------------------------------
export async function updateAuditStatus(args: {
  audit_id: string;
  status: DB["audits"]["Row"]["status"];
  progress: number;
  current_step?: string;
  error_message?: string | null;
}): Promise<void> {
  const sb = createAdminClient();
  const update: DB["audits"]["Update"] = {
    status: args.status,
    progress: args.progress,
    current_step: args.current_step,
    error_message: args.error_message ?? null,
  };
  const { error } = await sb.from("audits").update(update).eq("id", args.audit_id);
  if (error) {
    console.error(`[persist] updateAuditStatus failed : ${error.message}`);
  }
}

// ---------------------------------------------------------------------
// Etape 2 : business info extrait
// ---------------------------------------------------------------------
export async function persistBusinessInfo(args: {
  audit_id: string;
  business: BusinessInfo;
}): Promise<void> {
  const sb = createAdminClient();
  const row: DB["audit_business_info"]["Insert"] = {
    audit_id: args.audit_id,
    brand_name: args.business.brand_name,
    brand_aliases: args.business.brand_aliases,
    industry: args.business.industry,
    services: args.business.services,
    geo_zone: args.business.geo_zone,
    // Localisation structuree — drive la generation de queries dans
    // stepGenerateQueries (cf. lib/ai/prompts/queries-gen.ts).
    city: args.business.city ?? null,
    city_main: args.business.city_main ?? null,
    region: args.business.region ?? null,
    country: args.business.country ?? null,
    business_scope: args.business.business_scope ?? "national",
    detected_competitors: args.business.detected_competitors,
    raw_extraction: args.business as unknown as Database["public"]["Tables"]["audit_business_info"]["Insert"]["raw_extraction"],
  };
  const { error } = await sb.from("audit_business_info").insert(row);
  if (error) {
    console.error(`[persist] business_info failed : ${error.message}`);
  }
}

// ---------------------------------------------------------------------
// Etape 1 : audit technique (5 categories)
// ---------------------------------------------------------------------
export async function persistTechnicalChecks(args: {
  audit_id: string;
  technical: TechAuditResult;
}): Promise<void> {
  const sb = createAdminClient();
  const rows: DB["audit_technical"]["Insert"][] = args.technical.categories.map(
    (cat) => ({
      audit_id: args.audit_id,
      category: cat.category,
      checks: cat.checks as unknown as DB["audit_technical"]["Insert"]["checks"],
      score: cat.score,
    })
  );
  const { error } = await sb.from("audit_technical").insert(rows);
  if (error) {
    console.error(`[persist] technical_checks failed : ${error.message}`);
  }
}

// ---------------------------------------------------------------------
// Etape 3 : queries generees (bulk insert)
// Renvoie le mapping local_id -> supabase_uuid (les VisibilityQuery
// generes par le pipeline ont des UUID locaux, on les remplace par
// les UUID Supabase pour pouvoir relier les ai_responses).
// ---------------------------------------------------------------------
export async function persistQueries(args: {
  audit_id: string;
  queries: VisibilityQuery[];
}): Promise<QueryIdMap> {
  const sb = createAdminClient();
  const rows: DB["queries"]["Insert"][] = args.queries.map((q) => ({
    audit_id: args.audit_id,
    text: q.text,
    category: q.category,
    position: q.position,
  }));
  const { data, error } = await sb.from("queries").insert(rows).select("id, position");
  if (error || !data) {
    throw new Error(`persistQueries failed : ${error?.message}`);
  }
  // Map position → supabase_id
  const positionToSupabaseId = new Map<number, string>();
  for (const r of data) positionToSupabaseId.set(r.position, r.id);

  // Map local_id → supabase_id via la position (stable). On retourne
  // un plain object (Record) plutot qu'un Map JS pour rester
  // serialisable JSON entre les steps Inngest (cf. lib/ai/query-id-map).
  const localToSupabase: QueryIdMap = {};
  for (const q of args.queries) {
    const supId = positionToSupabaseId.get(q.position);
    if (supId) localToSupabase[q.id] = supId;
  }
  return localToSupabase;
}

// ---------------------------------------------------------------------
// Etape 4 : ai_responses + ai_response_analysis (bulk)
// Le mapping local_id → supabase_id permet de remettre les bons FK.
// ---------------------------------------------------------------------
export async function persistAiResponses(args: {
  responses: VisibilityResponse[];
  query_id_map: QueryIdMap;
}): Promise<void> {
  const sb = createAdminClient();

  // Defense en profondeur : si un caller passe encore un Map ou une
  // structure inattendue (legacy code, deserialisation Inngest ratee),
  // toQueryIdMap normalise vers Record sans planter.
  const idMap = toQueryIdMap(args.query_id_map);

  // Insert ai_responses
  const responseRows: DB["ai_responses"]["Insert"][] = args.responses.map(
    (r) => ({
      query_id: lookupQueryId(idMap, r.query_id),
      provider: r.provider,
      model: r.model,
      raw_response: r.response_text || null,
      sources: r.sources as unknown as DB["ai_responses"]["Insert"]["sources"],
      tokens_in: r.tokens_in,
      tokens_out: r.tokens_out,
      cost_usd: r.cost_usd,
      latency_ms: r.latency_ms,
      error_message: r.error ?? null,
    })
  );

  // Bulk insert avec retour des IDs
  const { data: inserted, error } = await sb
    .from("ai_responses")
    .insert(responseRows)
    .select("id, query_id, provider");
  if (error || !inserted) {
    console.error(`[persist] ai_responses failed : ${error?.message}`);
    return;
  }

  // Map (query_id_supabase + provider) → response_id_supabase
  const responseIdMap = new Map<string, string>();
  for (const r of inserted) {
    responseIdMap.set(`${r.query_id}|${r.provider}`, r.id);
  }

  // Insert ai_response_analysis pour chaque response qui a une analysis
  const analysisRows: DB["ai_response_analysis"]["Insert"][] = [];
  for (const r of args.responses) {
    if (!r.analysis) continue;
    const queryIdSb = lookupQueryId(idMap, r.query_id);
    const respId = responseIdMap.get(`${queryIdSb}|${r.provider}`);
    if (!respId) continue;
    analysisRows.push({
      response_id: respId,
      brand_mentioned: r.analysis.brand_mentioned,
      mention_position: r.analysis.mention_position,
      mention_context: r.analysis.mention_context,
      brand_citation_present: r.analysis.brand_citation_present,
      sentiment: r.analysis.sentiment,
      competitors_cited: r.analysis.competitors_cited,
      sources_cited: r.analysis.sources_cited,
      raw_analysis: {
        detection_method: r.analysis.detection_method,
        llm_cost_eur: r.analysis.llm_cost_eur,
      } as unknown as DB["ai_response_analysis"]["Insert"]["raw_analysis"],
    });
  }
  if (analysisRows.length > 0) {
    const { error: errAna } = await sb
      .from("ai_response_analysis")
      .insert(analysisRows);
    if (errAna) {
      console.error(`[persist] ai_response_analysis failed : ${errAna.message}`);
    }
  }
}

// ---------------------------------------------------------------------
// Etape 5 : audit_scores
// ---------------------------------------------------------------------
export async function persistScores(args: {
  audit_id: string;
  technical_score: number;
  visibility_scores: VisibilityScores;
  global_score: number;
}): Promise<void> {
  const sb = createAdminClient();
  const row: DB["audit_scores"]["Insert"] = {
    audit_id: args.audit_id,
    technical_score: args.technical_score,
    visibility_score: args.visibility_scores.global_score,
    global_score: args.global_score,
    visibility_per_provider:
      args.visibility_scores.per_provider as unknown as DB["audit_scores"]["Insert"]["visibility_per_provider"],
    mention_rate: args.visibility_scores.mention_rate,
    citation_rate: args.visibility_scores.citation_rate,
    top_competitor:
      args.visibility_scores.top_competitors[0]?.name ?? null,
  };
  const { error } = await sb.from("audit_scores").insert(row);
  if (error) {
    console.error(`[persist] scores failed : ${error.message}`);
  }
}

// ---------------------------------------------------------------------
// Etape 5b : snapshot historique pour le bloc Evolution.
//
// Une ligne par audit termine, indexee sur url_normalized pour
// permettre le calcul "vs precedent" sur le meme domaine. Pas de
// donnee inventee/volume estime — uniquement ce qu'on a mesure.
//
// `cited_queries` stocke les texts de query (lowercase+trim+spaces
// collapses) ou la marque a ete citee par >=1 IA. Sert au calcul
// gained/lost dans le rapport.
// ---------------------------------------------------------------------
export async function persistAuditHistory(args: {
  audit_id: string;
  url_normalized: string;
  global_score: number;
  visibility_scores: VisibilityScores;
  presence_branded: number;
  presence_service: number;
  presence_comparative: number;
  cited_queries: string[];
}): Promise<void> {
  const sb = createAdminClient();
  const row: DB["audit_history"]["Insert"] = {
    audit_id: args.audit_id,
    url_normalized: args.url_normalized,
    global_score: args.global_score,
    mention_rate: args.visibility_scores.mention_rate,
    presence_branded: args.presence_branded,
    presence_service: args.presence_service,
    presence_comparative: args.presence_comparative,
    scores_per_provider:
      args.visibility_scores.per_provider as unknown as DB["audit_history"]["Insert"]["scores_per_provider"],
    cited_queries: args.cited_queries,
  };
  // upsert : audit_id est PK, idempotent en cas de replay Inngest
  const { error } = await sb
    .from("audit_history")
    .upsert(row, { onConflict: "audit_id" });
  if (error) {
    console.error(`[persist] audit_history failed : ${error.message}`);
  }
}

// ---------------------------------------------------------------------
// Etape 6 : recommendations (bulk)
// ---------------------------------------------------------------------
export async function persistRecommendations(args: {
  audit_id: string;
  synthesis: Synthesis;
}): Promise<void> {
  if (!args.synthesis.recommendations || args.synthesis.recommendations.length === 0) {
    return;
  }
  const sb = createAdminClient();
  const rows: DB["audit_recommendations"]["Insert"][] = args.synthesis.recommendations.map(
    (r, i) => ({
      audit_id: args.audit_id,
      priority: r.priority,
      category: r.category,
      title: r.title,
      description: r.description,
      impact_score: r.impact_score,
      position: i + 1,
    })
  );
  const { error } = await sb.from("audit_recommendations").insert(rows);
  if (error) {
    console.error(`[persist] recommendations failed : ${error.message}`);
  }
}

// ---------------------------------------------------------------------
// Etape finale : marque l'audit comme done + completed_at
// ---------------------------------------------------------------------
export async function finalizeAudit(args: {
  audit_id: string;
  language?: string | null;
}): Promise<void> {
  const sb = createAdminClient();
  const update: DB["audits"]["Update"] = {
    status: "done",
    progress: 100,
    current_step: "Termine",
    completed_at: new Date().toISOString(),
    language: args.language,
  };
  const { error } = await sb.from("audits").update(update).eq("id", args.audit_id);
  if (error) {
    console.error(`[persist] finalizeAudit failed : ${error.message}`);
  }
}

// Marque un audit comme echoue
export async function markAuditFailed(args: {
  audit_id: string;
  error_message: string;
}): Promise<void> {
  const sb = createAdminClient();
  const update: DB["audits"]["Update"] = {
    status: "failed",
    error_message: args.error_message,
    completed_at: new Date().toISOString(),
  };
  await sb.from("audits").update(update).eq("id", args.audit_id);
}

// Provider names typed helper (utile pour les Object.keys typages)
export const ALL_PROVIDERS: AIProvider[] = ["openai", "anthropic", "perplexity", "gemini"];
