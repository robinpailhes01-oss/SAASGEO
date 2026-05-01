// =====================================================================
// Sous-etapes du pipeline — utilisables individuellement par :
//  - runFullAudit() (CLI / sync)
//  - inngest/functions/run-audit.ts (durable, retries natifs Inngest)
//
// Chaque step est :
//  - autonome (re-executable independamment, idempotent dans la mesure
//    du possible)
//  - logue son resultat
//  - retourne un payload serialisable JSON (compatible Inngest step.run)
// =====================================================================

import { runTechAudit } from "@/lib/scraping/tech-audit";
import type { TechAuditResult } from "@/lib/scraping/types";
import { loadHtml, extractVisibleText } from "@/lib/scraping/parser";
import { fetchPage } from "@/lib/scraping/fetcher";

import { generateText } from "./providers";
import { TASK_MODELS, modelToProvider } from "./models";
import { trackApiCall } from "./cost-tracker";

import {
  buildBrandExtractPrompt,
  BusinessInfoSchema,
  type BusinessInfo,
} from "./prompts/brand-extract";
import {
  buildQueriesGenPrompt,
  GeneratedQueriesSchema,
} from "./prompts/queries-gen";
import {
  buildSynthesisPrompt,
  SynthesisSchema,
  type Synthesis,
} from "./prompts/synthesis";

import {
  trackVisibility,
  computeVisibilityScores,
  type VisibilityQuery,
  type VisibilityResponse,
  type VisibilityScores,
} from "./visibility-tracker";

import {
  updateAuditStatus,
  persistTechnicalChecks,
  persistBusinessInfo,
  persistQueries,
  persistAiResponses,
  persistScores,
  persistRecommendations,
  finalizeAudit,
} from "./persistence";

import { randomUUID } from "node:crypto";

// =====================================================================
// Step 1 : Audit technique
// =====================================================================
export async function stepTechAudit(args: {
  audit_id: string;
  url: string;
  persist: boolean;
}): Promise<TechAuditResult> {
  if (args.persist) {
    await updateAuditStatus({
      audit_id: args.audit_id,
      status: "scraping",
      progress: 5,
      current_step: "Scraping + 51 checks techniques",
    });
  }
  const technical = await runTechAudit(args.url, { verbose: false });
  if (args.persist) {
    await persistTechnicalChecks({ audit_id: args.audit_id, technical });
    await updateAuditStatus({
      audit_id: args.audit_id,
      status: "scraping",
      progress: 20,
      current_step: `Audit technique : ${technical.total_score}/100`,
    });
  }
  return technical;
}

// =====================================================================
// Step 2 : Extraction business info (LLM Haiku)
// =====================================================================
export async function stepExtractBusiness(args: {
  audit_id: string;
  url: string;
  technical: TechAuditResult;
  persist: boolean;
}): Promise<BusinessInfo> {
  if (args.persist) {
    await updateAuditStatus({
      audit_id: args.audit_id,
      status: "extracting",
      progress: 25,
      current_step: "Extraction business info (LLM Haiku)",
    });
  }

  const fetchResult = await fetchPage(args.url, { verbose: false });
  const $ = loadHtml(fetchResult.html);
  const text = extractVisibleText($).slice(0, 3000);

  const { system, prompt } = buildBrandExtractPrompt(text, args.url);
  const model = TASK_MODELS.brand_extraction;
  const result = await generateText(model, {
    system,
    prompt,
    temperature: 0,
    jsonMode: true,
    maxTokens: 800,
  });

  await trackApiCall({
    user_id: process.env.ADMIN_USER_ID ?? null,
    audit_id: args.audit_id,
    provider: modelToProvider(model),
    model,
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
    request_type: "brand_extraction",
    actual_cost_usd: result.cost_usd,
  });

  let business: BusinessInfo;
  try {
    business = BusinessInfoSchema.parse(JSON.parse(result.text));
  } catch (e) {
    console.warn(
      `[pipeline-steps] business extract parse failed : ${e instanceof Error ? e.message : String(e)}`
    );
    business = {
      brand_name: args.technical.domain,
      brand_aliases: [],
      industry: null,
      services: [],
      geo_zone: null,
      detected_competitors: [],
      language: "fr",
    };
  }

  if (args.persist) {
    await persistBusinessInfo({ audit_id: args.audit_id, business });
    await updateAuditStatus({
      audit_id: args.audit_id,
      status: "extracting",
      progress: 35,
      current_step: `Business : ${business.brand_name}`,
    });
  }

  return business;
}

// =====================================================================
// Step 3 : Generation 30 queries (LLM Sonnet)
// =====================================================================
export async function stepGenerateQueries(args: {
  audit_id: string;
  business: BusinessInfo;
  persist: boolean;
}): Promise<{ queries: VisibilityQuery[]; query_id_map: Map<string, string> }> {
  if (args.persist) {
    await updateAuditStatus({
      audit_id: args.audit_id,
      status: "querying",
      progress: 40,
      current_step: "Generation 30 queries (LLM Sonnet)",
    });
  }

  const { system, prompt } = buildQueriesGenPrompt(args.business);
  const model = TASK_MODELS.queries_generation;
  const result = await generateText(model, {
    system,
    prompt,
    temperature: 0.6,
    jsonMode: true,
    maxTokens: 2000,
  });

  await trackApiCall({
    user_id: process.env.ADMIN_USER_ID ?? null,
    audit_id: args.audit_id,
    provider: modelToProvider(model),
    model,
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
    request_type: "queries_generation",
    actual_cost_usd: result.cost_usd,
  });

  const parsed = GeneratedQueriesSchema.parse(JSON.parse(result.text));

  const queries: VisibilityQuery[] = [];
  let pos = 1;
  for (const text of parsed.branded) {
    queries.push({ id: randomUUID(), text, category: "branded", position: pos++ });
  }
  for (const text of parsed.service) {
    queries.push({ id: randomUUID(), text, category: "service", position: pos++ });
  }
  for (const text of parsed.comparative) {
    queries.push({ id: randomUUID(), text, category: "comparative", position: pos++ });
  }

  let query_id_map = new Map<string, string>();
  if (args.persist) {
    query_id_map = await persistQueries({ audit_id: args.audit_id, queries });
    await updateAuditStatus({
      audit_id: args.audit_id,
      status: "querying",
      progress: 50,
      current_step: `${queries.length} queries generees`,
    });
  }

  return { queries, query_id_map };
}

// =====================================================================
// Step 4 : Visibility tracking (120 calls fan-out)
//
// Variante "tous providers" — utilisee par runFullAudit (CLI).
// =====================================================================
export async function stepTrackVisibility(args: {
  audit_id: string;
  queries: VisibilityQuery[];
  business: BusinessInfo;
  query_id_map: Map<string, string>;
  geo_target?: string | null;
  concurrency?: number;
  persist: boolean;
  verbose?: boolean;
}): Promise<{ responses: VisibilityResponse[]; scores: VisibilityScores }> {
  if (args.persist) {
    await updateAuditStatus({
      audit_id: args.audit_id,
      status: "querying",
      progress: 55,
      current_step: "Visibility tracking 4 IA en parallele (120 appels)",
    });
  }

  const responses = await trackVisibility(args.queries, {
    brand_name: args.business.brand_name,
    brand_aliases: args.business.brand_aliases,
    geo_target: args.geo_target ?? args.business.geo_zone,
    audit_id: args.audit_id,
    concurrency: args.concurrency ?? 8,
    verbose: args.verbose ?? false,
  });

  const scores = computeVisibilityScores(responses);

  if (args.persist) {
    await persistAiResponses({
      responses,
      query_id_map: args.query_id_map,
    });
    await updateAuditStatus({
      audit_id: args.audit_id,
      status: "analyzing",
      progress: 85,
      current_step: `Visibility : ${scores.global_score}/100`,
    });
  }

  return { responses, scores };
}

// =====================================================================
// Variante "single provider" — utilisee par Inngest pour fan-out
// parallele 1 step.run par provider (durabilite + retries par provider).
// PAS de persistAiResponses ici : on aggregate et persist a la fin
// dans stepTrackVisibilityAggregate ci-dessous.
// =====================================================================
import type { AIProvider } from "./types";

export async function stepTrackVisibilityForProvider(args: {
  audit_id: string;
  queries: VisibilityQuery[];
  business: BusinessInfo;
  provider: AIProvider;
  geo_target?: string | null;
  concurrency?: number;
  verbose?: boolean;
}): Promise<VisibilityResponse[]> {
  const responses = await trackVisibility(args.queries, {
    brand_name: args.business.brand_name,
    brand_aliases: args.business.brand_aliases,
    geo_target: args.geo_target ?? args.business.geo_zone,
    audit_id: args.audit_id,
    concurrency: args.concurrency ?? 8,
    verbose: args.verbose ?? false,
    only_provider: args.provider,
  });
  return responses;
}

// Aggregation des reponses des 4 providers + persist + compute scores.
// Appelee apres step.parallel des 4 providers.
export async function stepAggregateVisibility(args: {
  audit_id: string;
  responses: VisibilityResponse[];
  query_id_map: Map<string, string>;
  persist: boolean;
}): Promise<VisibilityScores> {
  const scores = computeVisibilityScores(args.responses);

  if (args.persist) {
    await persistAiResponses({
      responses: args.responses,
      query_id_map: args.query_id_map,
    });
    await updateAuditStatus({
      audit_id: args.audit_id,
      status: "analyzing",
      progress: 85,
      current_step: `Visibility : ${scores.global_score}/100`,
    });
  }

  return scores;
}

// =====================================================================
// Step 5 : Compute final scores (40/60 ponderation)
// =====================================================================
export async function stepComputeScores(args: {
  audit_id: string;
  technical: TechAuditResult;
  visibility_scores: VisibilityScores;
  persist: boolean;
}): Promise<{
  technical_score: number;
  visibility_score: number;
  global_score: number;
}> {
  const technical_score = args.technical.total_score;
  const visibility_score = args.visibility_scores.global_score;
  const global_score = Math.round(0.4 * technical_score + 0.6 * visibility_score);

  if (args.persist) {
    await persistScores({
      audit_id: args.audit_id,
      technical_score,
      visibility_scores: args.visibility_scores,
      global_score,
    });
    await updateAuditStatus({
      audit_id: args.audit_id,
      status: "scoring",
      progress: 90,
      current_step: `Score global : ${global_score}/100`,
    });
  }

  return { technical_score, visibility_score, global_score };
}

// =====================================================================
// Step 6 : Synthese (LLM Sonnet)
// =====================================================================
export async function stepSynthesis(args: {
  audit_id: string;
  business: BusinessInfo;
  technical: TechAuditResult;
  scores: {
    technical_score: number;
    visibility_score: number;
  };
  visibility_scores: VisibilityScores;
  persist: boolean;
}): Promise<Synthesis> {
  if (args.persist) {
    await updateAuditStatus({
      audit_id: args.audit_id,
      status: "scoring",
      progress: 92,
      current_step: "Synthese et recommandations (LLM Sonnet)",
    });
  }

  const failedTechChecks: { label: string; recommendation?: string }[] = [];
  let totalChecks = 0;
  let passedChecks = 0;
  for (const cat of args.technical.categories) {
    for (const c of cat.checks) {
      totalChecks += 1;
      if (c.status === "pass") passedChecks += 1;
      if (c.status === "fail" || c.status === "warn") {
        failedTechChecks.push({
          label: c.label,
          recommendation: c.recommendation,
        });
      }
    }
  }

  const { system, prompt } = buildSynthesisPrompt({
    brand_name: args.business.brand_name,
    industry: args.business.industry,
    technical_score: args.scores.technical_score,
    visibility_score: args.scores.visibility_score,
    visibility_per_provider: args.visibility_scores.per_provider,
    mention_rate: args.visibility_scores.mention_rate,
    citation_rate: args.visibility_scores.citation_rate,
    top_competitors_observed: args.visibility_scores.top_competitors.map(
      (c) => c.name
    ),
    failed_tech_checks: failedTechChecks,
    passed_tech_checks_count: passedChecks,
    total_tech_checks: totalChecks,
  });

  const model = TASK_MODELS.synthesis;
  const result = await generateText(model, {
    system,
    prompt,
    temperature: 0.3,
    jsonMode: true,
    maxTokens: 3000,
  });

  await trackApiCall({
    user_id: process.env.ADMIN_USER_ID ?? null,
    audit_id: args.audit_id,
    provider: modelToProvider(model),
    model,
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
    request_type: "synthesis",
    actual_cost_usd: result.cost_usd,
  });

  let synthesis: Synthesis;
  try {
    synthesis = SynthesisSchema.parse(JSON.parse(result.text));
  } catch (e) {
    console.warn(
      `[pipeline-steps] synthesis parse failed : ${e instanceof Error ? e.message : String(e)}`
    );
    synthesis = {
      verdict: "Synthese non parsable.",
      top_competitor: null,
      recommendations: [],
    } as unknown as Synthesis;
  }

  if (args.persist) {
    await persistRecommendations({ audit_id: args.audit_id, synthesis });
  }

  return synthesis;
}

// =====================================================================
// Step 7 : Finalize audit
// =====================================================================
export async function stepFinalize(args: {
  audit_id: string;
  language: string | null;
  persist: boolean;
}): Promise<void> {
  if (args.persist) {
    await finalizeAudit({
      audit_id: args.audit_id,
      language: args.language,
    });
  }
}
