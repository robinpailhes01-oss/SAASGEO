// =====================================================================
// Pipeline complet d'audit Ankora :
//   1. ensureBudgetAvailable()  — refuse si projection > cap
//   2. runTechAudit()           — module scraping (deja Bloc 2)
//   3. extractBusinessInfo()    — LLM Haiku
//   4. generateQueries()        — LLM Sonnet (3x10 = 30)
//   5. trackVisibility()        — 30x4 = 120 LLM calls + analyses
//   6. computeFinalScores()     — pondere 40/60 tech/visibility
//   7. generateSynthesis()      — LLM Sonnet (verdict + recommandations)
//   8. checkAndAlertThresholds() — emails 70€ / 85€
// =====================================================================

import { runTechAudit } from "@/lib/scraping/tech-audit";
import type { TechAuditResult } from "@/lib/scraping/types";
import { loadHtml, extractVisibleText } from "@/lib/scraping/parser";
import { fetchPage } from "@/lib/scraping/fetcher";

import { generateText } from "./providers";
import { TASK_MODELS, modelToProvider } from "./models";
import { trackApiCall } from "./cost-tracker";
import {
  ensureBudgetAvailable,
  getMonthToDateSpend,
  checkAndAlertThresholds,
} from "./budget-guard";

import {
  buildBrandExtractPrompt,
  BusinessInfoSchema,
  type BusinessInfo,
} from "./prompts/brand-extract";
import {
  buildQueriesGenPrompt,
  GeneratedQueriesSchema,
  type GeneratedQueries,
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
  createAudit,
  updateAuditStatus,
  persistBusinessInfo,
  persistTechnicalChecks,
  persistQueries,
  persistAiResponses,
  persistScores,
  persistRecommendations,
  finalizeAudit,
  markAuditFailed,
} from "./persistence";

import { randomUUID } from "node:crypto";

export interface FullAuditResult {
  url: string;
  audit_id: string;
  fetched_at: string;
  duration_ms: number;
  // Phase 0 — tech audit (Bloc 2)
  technical: TechAuditResult;
  // Phase 1 — business info extrait
  business: BusinessInfo;
  // Phase 2 — queries generees
  queries: VisibilityQuery[];
  // Phase 3 — visibility tracking
  visibility_responses: VisibilityResponse[];
  visibility_scores: VisibilityScores;
  // Phase 4 — scores finaux ponderes 40/60
  scores: {
    technical_score: number;            // /100
    visibility_score: number;            // /100
    global_score: number;                // /100
    mention_rate: number;
    citation_rate: number;
    top_competitor: string | null;
  };
  // Phase 5 — synthese
  synthesis: Synthesis;
  // Couts
  costs: {
    extract_eur: number;
    queries_gen_eur: number;
    visibility_eur: number;
    analysis_eur: number;
    synthesis_eur: number;
    total_eur: number;
  };
}

interface RunOptions {
  verbose?: boolean;
  geo_target?: string | null;
  // Concurrence du visibility tracking
  concurrency?: number;
  // Si true, ne fait QUE l'audit technique (skip LLM). Pour debug.
  techOnly?: boolean;
  // Si false, n'ecrit pas dans Supabase (mode "dry run" pour tests).
  // Default true.
  persist?: boolean;
}

const ABORT_THRESHOLD_MULTIPLIER = 3;

export async function runFullAudit(
  url: string,
  opts: RunOptions = {}
): Promise<FullAuditResult> {
  const t0 = Date.now();
  const verbose = opts.verbose ?? true;
  const persist = opts.persist ?? true;
  const log = (msg: string) => {
    if (verbose) console.log(msg);
  };

  // ----------------------------------------------------------------
  // 0. Check budget AVANT de lancer
  // ----------------------------------------------------------------
  log(`[pipeline] 0/7 — Check budget`);
  const budgetBefore = await ensureBudgetAvailable();
  log(
    `   Budget : depense ${budgetBefore.current_total_eur.toFixed(2)}€ / cap ${budgetBefore.cap_eur}€ — restant ${budgetBefore.remaining_eur.toFixed(2)}€`
  );

  // ----------------------------------------------------------------
  // 0.5. Cree l'audit row Supabase (sauf si persist=false)
  // ----------------------------------------------------------------
  const audit_id = persist
    ? await createAudit({ url, geo_target: opts.geo_target })
    : randomUUID();
  log(`\n[pipeline] === Audit ${url} (id: ${audit_id}, persist=${persist}) ===`);

  // Wrapper qui swallow les erreurs de persistence (on ne fail pas
  // l'audit si Supabase a un hoquet)
  const safeUpdate = async (
    status: Parameters<typeof updateAuditStatus>[0]["status"],
    progress: number,
    step: string
  ) => {
    if (!persist) return;
    try {
      await updateAuditStatus({ audit_id, status, progress, current_step: step });
    } catch (e) {
      console.error(`[pipeline] updateStatus failed (non-fatal) :`, e);
    }
  };

  try {
    // ----------------------------------------------------------------
    // 1. Audit technique (Bloc 2)
    // ----------------------------------------------------------------
    await safeUpdate("scraping", 5, "Scraping + 51 checks");
    log(`[pipeline] 1/7 — Audit technique (scraping + 51 checks)`);
    const technical = await runTechAudit(url, { verbose: false });
    log(
      `   Score technique : ${technical.total_score}/100 (${technical.duration_ms}ms)`
    );

    if (opts.techOnly) {
      throw new Error("techOnly mode — utilisez runTechAudit directement");
    }

    if (persist) {
      await persistTechnicalChecks({ audit_id, technical });
    }
    await safeUpdate("scraping", 20, "Audit technique termine");

    // ----------------------------------------------------------------
    // 2. Extraction business info (LLM Haiku)
    // ----------------------------------------------------------------
    await safeUpdate("extracting", 25, "Extraction business info (LLM Haiku)");
    log(`[pipeline] 2/7 — Extraction business info (Claude Haiku)`);
    const business = await extractBusinessInfo(url, audit_id, technical, log);
    log(
      `   Marque : "${business.brand_name}" — secteur : ${business.industry ?? "?"} — geo : ${business.geo_zone ?? "?"}`
    );

    if (persist) {
      await persistBusinessInfo({ audit_id, business });
    }
    await safeUpdate("extracting", 35, "Business info extrait");

    // ----------------------------------------------------------------
    // 3. Generation des 30 queries (LLM Sonnet)
    // ----------------------------------------------------------------
    await safeUpdate("querying", 40, "Generation des 30 queries (LLM Sonnet)");
    log(`[pipeline] 3/7 — Generation 30 queries (Claude Sonnet)`);
    const queries = await generateQueries(business, audit_id, log);
    log(
      `   ${queries.length} queries generees (10 branded + 10 service + 10 comparative)`
    );

    // Plain object (Record) plutot que Map pour rester aligne avec
    // le contrat QueryIdMap utilise par les steps Inngest. Cf.
    // lib/ai/query-id-map.ts.
    let queryIdMap: import("./query-id-map").QueryIdMap = {};
    if (persist) {
      queryIdMap = await persistQueries({ audit_id, queries });
    }
    await safeUpdate("querying", 50, "Queries generees");

    // ----------------------------------------------------------------
    // 4. Visibility tracking : 30 queries x 4 providers = 120 appels
    // ----------------------------------------------------------------
    await safeUpdate("querying", 55, "Visibility tracking 4 IA en parallele");
    log(`[pipeline] 4/7 — Visibility tracking (120 appels LLM en parallele)`);
    const visibility_responses = await trackVisibility(queries, {
      brand_name: business.brand_name,
      brand_aliases: business.brand_aliases,
      geo_target: opts.geo_target ?? business.geo_zone,
      audit_id, // maintenant on a un vrai audit_id Supabase
      concurrency: opts.concurrency ?? 8,
      verbose,
    });
    const visibility_scores = computeVisibilityScores(visibility_responses);
    log(
      `   Score visibility : ${visibility_scores.global_score}/100 (mention rate ${visibility_scores.mention_rate.toFixed(1)}%, citation rate ${visibility_scores.citation_rate.toFixed(1)}%)`
    );

    if (persist) {
      await persistAiResponses({
        responses: visibility_responses,
        query_id_map: queryIdMap,
      });
    }
    await safeUpdate("analyzing", 85, "Reponses + analyses persistees");

    // ----------------------------------------------------------------
    // 5. Calcul scores finaux (ponderation 40/60)
    // ----------------------------------------------------------------
    await safeUpdate("scoring", 88, "Calcul scores finaux");
    log(`[pipeline] 5/7 — Calcul score global pondere 40/60`);
    const technical_score = technical.total_score;
    const visibility_score = visibility_scores.global_score;
    const global_score = Math.round(0.4 * technical_score + 0.6 * visibility_score);
    log(`   Score GLOBAL : ${global_score}/100`);

    if (persist) {
      await persistScores({
        audit_id,
        technical_score,
        visibility_scores,
        global_score,
      });
    }

    // ----------------------------------------------------------------
    // 6. Synthese (LLM Sonnet)
    // ----------------------------------------------------------------
    await safeUpdate("scoring", 92, "Synthese et recommandations (LLM Sonnet)");
    log(`[pipeline] 6/7 — Synthese + recommandations (Claude Sonnet)`);
    const failedTechChecks: { label: string; recommendation?: string }[] = [];
    let totalChecks = 0;
    let passedChecks = 0;
    for (const cat of technical.categories) {
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

    const synthesis = await generateSynthesisPrompt(
      {
        brand_name: business.brand_name,
        industry: business.industry,
        technical_score,
        visibility_score,
        visibility_per_provider: visibility_scores.per_provider,
        mention_rate: visibility_scores.mention_rate,
        citation_rate: visibility_scores.citation_rate,
        top_competitors_observed: visibility_scores.top_competitors.map((c) => c.name),
        failed_tech_checks: failedTechChecks,
        passed_tech_checks_count: passedChecks,
        total_tech_checks: totalChecks,
      },
      audit_id,
      log
    );
    log(
      `   Verdict : "${synthesis.verdict.slice(0, 100)}..."`
    );
    log(`   ${synthesis.recommendations.length} recommandations generees`);

    if (persist) {
      await persistRecommendations({ audit_id, synthesis });
    }

    // ----------------------------------------------------------------
    // 7. Verification budget post-audit + alertes + finalize
    // ----------------------------------------------------------------
    log(`[pipeline] 7/7 — Verification budget post-audit + alertes seuils`);
    const budgetAfter = await getMonthToDateSpend();
    const alertResult = await checkAndAlertThresholds({
      total_before_eur: budgetBefore.current_total_eur,
      total_after_eur: budgetAfter,
    });
    if (alertResult.alertSent) {
      log(`   ⚠ Email ${alertResult.alertSent} envoye`);
    }

    // Cap dur de securite : si on a depense >3x l'estimation, c'est suspect
    const audit_cost = budgetAfter - budgetBefore.current_total_eur;
    if (audit_cost > budgetBefore.estimated_audit_cost_eur * ABORT_THRESHOLD_MULTIPLIER) {
      console.error(
        `\n⚠ ALERTE COUT : audit a coute ${audit_cost.toFixed(2)}€ vs estimation ${budgetBefore.estimated_audit_cost_eur}€. Verifie les pricing tables.`
      );
    }

    // Calcule les couts par phase
    const visibility_eur = visibility_responses.reduce(
      (a, r) => a + r.cost_eur,
      0
    );
    const analysis_eur = visibility_responses.reduce(
      (a, r) => a + (r.analysis?.llm_cost_eur ?? 0),
      0
    );

    if (persist) {
      await finalizeAudit({ audit_id, language: technical.language });
    }

    const duration_ms = Date.now() - t0;
    log(
      `\n[pipeline] === Audit termine en ${(duration_ms / 1000).toFixed(1)}s — score global ${global_score}/100 — cout ${audit_cost.toFixed(4)}€ ===\n`
    );

    return {
      url,
      audit_id,
      fetched_at: new Date().toISOString(),
      duration_ms,
      technical,
      business,
      queries,
      visibility_responses,
      visibility_scores,
      scores: {
        technical_score,
        visibility_score,
        global_score,
        mention_rate: visibility_scores.mention_rate,
        citation_rate: visibility_scores.citation_rate,
        top_competitor:
          visibility_scores.top_competitors[0]?.name ?? null,
      },
      synthesis,
      costs: {
        extract_eur: 0,
        queries_gen_eur: 0,
        visibility_eur,
        analysis_eur,
        synthesis_eur: 0,
        total_eur: audit_cost,
      },
    };
  } catch (e) {
    // Marque l'audit comme failed avant de re-throw
    if (persist) {
      await markAuditFailed({
        audit_id,
        error_message: e instanceof Error ? e.message : String(e),
      });
    }
    throw e;
  }
}

// ---------------------------------------------------------------------
// Helpers : appels LLM avec parsing + tracking
// ---------------------------------------------------------------------

async function extractBusinessInfo(
  url: string,
  audit_id: string,
  techAudit: TechAuditResult,
  log: (s: string) => void
): Promise<BusinessInfo> {
  // On refait un fetch leger pour extraire le texte (pour ne pas avoir
  // a le balader dans l'objet TechAuditResult).
  const fetchResult = await fetchPage(url, { verbose: false });
  const $ = loadHtml(fetchResult.html);
  const text = extractVisibleText($).slice(0, 3000);

  const { system, prompt } = buildBrandExtractPrompt(text, url);
  const model = TASK_MODELS.brand_extraction;

  const result = await generateText(model, {
    system,
    prompt,
    temperature: 0,
    jsonMode: true,
    maxTokens: 800,
  });

  // audit_id reel desormais (cree en debut de pipeline)
  await trackApiCall({
    user_id: process.env.ADMIN_USER_ID ?? null,
    audit_id,
    provider: modelToProvider(model),
    model,
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
    request_type: "brand_extraction",
    actual_cost_usd: result.cost_usd,
  });

  try {
    const json = JSON.parse(result.text);
    return BusinessInfoSchema.parse(json);
  } catch (e) {
    log(
      `   ⚠ Parse business info echec : ${e instanceof Error ? e.message : String(e)}`
    );
    log(`   Brut LLM : ${result.text.slice(0, 200)}...`);
    // Fallback minimal
    return {
      brand_name: techAudit.domain,
      brand_aliases: [],
      industry: null,
      services: [],
      geo_zone: null,
      city: null,
      region: null,
      country: null,
      business_scope: "national",
      detected_competitors: [],
      language: "fr",
    };
  }
}

async function generateQueries(
  business: BusinessInfo,
  audit_id: string,
  log: (s: string) => void
): Promise<VisibilityQuery[]> {
  const { system, prompt } = buildQueriesGenPrompt(business);
  const model = TASK_MODELS.queries_generation;

  const result = await generateText(model, {
    system,
    prompt,
    temperature: 0.6,
    jsonMode: true,
    maxTokens: 2000,
  });

  // audit_id reel desormais (cree en debut de pipeline)
  await trackApiCall({
    user_id: process.env.ADMIN_USER_ID ?? null,
    audit_id,
    provider: modelToProvider(model),
    model,
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
    request_type: "queries_generation",
    actual_cost_usd: result.cost_usd,
  });

  let parsed: GeneratedQueries;
  try {
    const json = JSON.parse(result.text);
    parsed = GeneratedQueriesSchema.parse(json);
  } catch (e) {
    log(
      `   ⚠ Parse queries echec : ${e instanceof Error ? e.message : String(e)}`
    );
    log(`   Brut LLM : ${result.text.slice(0, 300)}...`);
    throw new Error(
      `Generation queries a produit un JSON invalide. Cf. log pour le brut.`
    );
  }

  // Aplatit en VisibilityQuery[]
  const queries: VisibilityQuery[] = [];
  let pos = 1;
  for (const text of parsed.branded) {
    queries.push({
      id: randomUUID(),
      text,
      category: "branded",
      position: pos++,
    });
  }
  for (const text of parsed.service) {
    queries.push({
      id: randomUUID(),
      text,
      category: "service",
      position: pos++,
    });
  }
  for (const text of parsed.comparative) {
    queries.push({
      id: randomUUID(),
      text,
      category: "comparative",
      position: pos++,
    });
  }
  return queries;
}

async function generateSynthesisPrompt(
  input: Parameters<typeof buildSynthesisPrompt>[0],
  audit_id: string,
  log: (s: string) => void
): Promise<Synthesis> {
  const { system, prompt } = buildSynthesisPrompt(input);
  const model = TASK_MODELS.synthesis;

  const result = await generateText(model, {
    system,
    prompt,
    temperature: 0.3,
    jsonMode: true,
    maxTokens: 3000,
  });

  // audit_id reel desormais (cree en debut de pipeline)
  await trackApiCall({
    user_id: process.env.ADMIN_USER_ID ?? null,
    audit_id,
    provider: modelToProvider(model),
    model,
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
    request_type: "synthesis",
    actual_cost_usd: result.cost_usd,
  });

  try {
    const json = JSON.parse(result.text);
    return SynthesisSchema.parse(json);
  } catch (e) {
    log(
      `   ⚠ Parse synthesis echec : ${e instanceof Error ? e.message : String(e)}`
    );
    log(`   Brut LLM : ${result.text.slice(0, 300)}...`);
    // Fallback minimal
    return {
      verdict: "Synthese non parsable — voir le brut dans les logs.",
      top_competitor: null,
      recommendations: [],
    } as unknown as Synthesis;
  }
}
