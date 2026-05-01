// =====================================================================
// Fonction Inngest : orchestre l'audit complet en steps avec retries
// natifs + checkpoints durables.
//
// Trigger : event "audit/requested" emis par POST /api/audits.
//
// Steps (chacun memoize par Inngest — re-execution intelligente si crash) :
//   1. tech-audit         — scraping + 51 checks
//   2. extract-business   — LLM Haiku extraction
//   3. generate-queries   — LLM Sonnet 30 queries
//   4. visibility-tracking — 120 LLM calls fan-out
//   5. compute-scores     — ponderation 40/60
//   6. synthesis          — LLM Sonnet verdict + reco
//   7. finalize           — UPDATE audits.status='done'
//
// Note : step 4 contient le fan-out interne (Promise.all bornee).
// On NE peut pas decouper en step.parallel par provider car les 4
// providers utilisent les memes queries (4*30 = 120 step.run serait
// disproportionne pour Inngest qui facture par execution).
// =====================================================================

import { inngest } from "../client";
import {
  stepTechAudit,
  stepExtractBusiness,
  stepGenerateQueries,
  stepTrackVisibilityForProvider,
  stepAggregateVisibility,
  stepComputeScores,
  stepSynthesis,
  stepFinalize,
} from "@/lib/ai/pipeline-steps";
import { updateAuditStatus } from "@/lib/ai/persistence";
import type { AIProvider } from "@/lib/ai/types";
import { ensureBudgetAvailable, checkAndAlertThresholds, getMonthToDateSpend } from "@/lib/ai/budget-guard";
import { markAuditFailed } from "@/lib/ai/persistence";

interface AuditRequestedPayload {
  audit_id: string;
  url: string;
  geo_target?: string | null;
}

// Type minimal pour le step de Inngest. On evite d'importer le type
// complet pour ne pas se coupler a une version specifique du SDK.
interface InngestStep {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
}

export const runAuditFunction = inngest.createFunction(
  {
    id: "run-audit",
    name: "Audit complet Ankora",
    // Pas de retry global — chaque step.run a ses propres retries (3 par
    // defaut Inngest). Si un step echoue 3x, l'audit entier est marque failed.
    retries: 0,
    // Concurrence : max 3 audits simultanes
    concurrency: { limit: 3 },
    triggers: [{ event: "audit/requested" }],
  },
  async ({ event, step }: { event: { data: AuditRequestedPayload }; step: InngestStep }) => {
    const { audit_id, url, geo_target } = event.data;

    try {
      // Budget check (pas dans un step.run car non-coute, juste lecture)
      const budgetBefore = await ensureBudgetAvailable();

      // -------- Step 1 : Tech audit --------
      const technical = await step.run("tech-audit", () =>
        stepTechAudit({ audit_id, url, persist: true })
      );

      // -------- Step 2 : Extract business --------
      const business = await step.run("extract-business", () =>
        stepExtractBusiness({ audit_id, url, technical, persist: true })
      );

      // -------- Step 3 : Generate queries --------
      const queriesResult = await step.run("generate-queries", () =>
        stepGenerateQueries({ audit_id, business, persist: true })
      );

      // -------- Step 4 : Visibility tracking — fan-out 4 providers en parallele --------
      // Chaque provider tourne dans son propre step.run avec retries natifs.
      // Si Anthropic crash, OpenAI / Perplexity / Gemini deja checkpointed.
      //
      // Note serialisation Inngest : `query_id_map` est un Record<string,
      // string> (plain object) — directement JSON-serialisable. C'etait
      // un Map JS avant, ce qui causait "TypeError: ...entries is not a
      // function" car JSON.stringify d'un Map donne "{}". Cf.
      // lib/ai/query-id-map.ts pour le contrat et le helper defensif.
      const queryIdMap = queriesResult.query_id_map;

      // Update status avant le fan-out
      await updateAuditStatus({
        audit_id,
        status: "querying",
        progress: 55,
        current_step: "Visibility tracking — fan-out 4 IA en parallele",
      });

      const providers: AIProvider[] = ["openai", "anthropic", "perplexity", "gemini"];
      const responsesPerProvider = await Promise.all(
        providers.map((provider) =>
          step.run(`visibility-${provider}`, () =>
            stepTrackVisibilityForProvider({
              audit_id,
              queries: queriesResult.queries,
              business,
              provider,
              geo_target,
              concurrency: 8,
              verbose: false,
            })
          )
        )
      );

      // Aggregation + persistance + scoring (1 seul step a la fin)
      const allResponses = responsesPerProvider.flat();
      const visibilityScores = await step.run("aggregate-visibility", () =>
        stepAggregateVisibility({
          audit_id,
          responses: allResponses,
          query_id_map: queryIdMap,
          persist: true,
        })
      );

      // -------- Step 5 : Compute scores --------
      const scores = await step.run("compute-scores", () =>
        stepComputeScores({
          audit_id,
          technical,
          visibility_scores: visibilityScores,
          persist: true,
        })
      );

      // -------- Step 6 : Synthesis --------
      const synthesis = await step.run("synthesis", () =>
        stepSynthesis({
          audit_id,
          business,
          technical,
          scores: {
            technical_score: scores.technical_score,
            visibility_score: scores.visibility_score,
          },
          visibility_scores: visibilityScores,
          persist: true,
        })
      );

      // -------- Step 7 : Finalize --------
      await step.run("finalize", () =>
        stepFinalize({
          audit_id,
          language: technical.language,
          persist: true,
        })
      );

      // Post-audit : alertes budget (hors step.run, lecture seule)
      const budgetAfter = await getMonthToDateSpend();
      await checkAndAlertThresholds({
        total_before_eur: budgetBefore.current_total_eur,
        total_after_eur: budgetAfter,
      });

      return {
        success: true,
        audit_id,
        global_score: scores.global_score,
        cost_eur: budgetAfter - budgetBefore.current_total_eur,
        recommendations_count: synthesis.recommendations?.length ?? 0,
      };
    } catch (e) {
      // Marque l'audit failed avant de re-throw (Inngest le verra failed)
      await markAuditFailed({
        audit_id,
        error_message: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }
);
