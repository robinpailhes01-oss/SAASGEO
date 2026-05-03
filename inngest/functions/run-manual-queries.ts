// =====================================================================
// Fonction Inngest : mini-pipeline visibility-only sur les requetes
// ajoutees manuellement par le client (queries.source = 'user').
//
// Trigger : event "audit/manual-queries-added" emis par
// POST /api/audits/[id]/manual-queries.
//
// Steps :
//   1. fetch-context : recupere business_info + queries 'user' a traiter
//   2. visibility-fanout : 1 step.run par provider, comme le pipeline
//      principal (durabilite + retries natifs si 1 IA crash)
//   3. persist : ai_responses + ai_response_analysis (bulk)
//
// IMPORTANT — INVARIANT :
//   - Aucun appel a stepComputeScores : audit_scores.global_score reste
//     fige sur les 30 queries source='generated'. Les manuelles sont
//     volontairement isolees (anti-biais : un client cherry-pick des
//     requetes ou il sait qu'il est bon).
//   - Aucun update audits.status : l'audit reste 'done'. Le frontend
//     polle GET /api/audits/[id]/manual-queries pour suivre la
//     completion (bool `pending` qui passe a false quand toutes les
//     analyses sont persistees).
//   - Concurrence Inngest 5 (vs 3 pour le pipeline principal) : c'est
//     leger (3 queries x 4 IA max), peu de risque de saturation.
//
// REGLE D'OR INNGEST (rappel) :
//   Tout code en DEHORS de step.run() re-execute a chaque replay de la
//   fonction. Les writes DOIVENT etre dans step.run(). Les reads peuvent
//   etre hors mais on les wrap par precaution. Cf. inngest/functions/
//   run-audit.ts pour le commentaire de tete detaille.
// =====================================================================

import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/server";
import { trackVisibility, type VisibilityQuery } from "@/lib/ai/visibility-tracker";
import { persistAiResponses } from "@/lib/ai/persistence";
import type { AIProvider } from "@/lib/ai/types";

interface ManualQueriesAddedPayload {
  audit_id: string;
  query_ids: string[];
}

interface InngestStep {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
}

export const runManualQueriesFunction = inngest.createFunction(
  {
    id: "run-manual-queries",
    name: "Audit — requetes manuelles",
    retries: 0, // les step.run ont leurs propres retries (3 par defaut)
    concurrency: { limit: 5 },
    triggers: [{ event: "audit/manual-queries-added" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: ManualQueriesAddedPayload };
    step: InngestStep;
  }) => {
    const t0 = Date.now();
    const { audit_id, query_ids } = event.data;
    console.log(
      `[run-manual-queries] START audit=${audit_id} query_ids=[${query_ids?.join(",")}]`
    );

    if (!audit_id || !Array.isArray(query_ids) || query_ids.length === 0) {
      console.warn(
        `[run-manual-queries] empty payload — abort. audit=${audit_id} ids=${JSON.stringify(query_ids)}`
      );
      return { success: false, reason: "empty_payload" };
    }

    // Step 1 : fetch business + queries (read, mais wrap par precaution
    // pour eviter N+1 en cas de replay)
    const context = await step.run("fetch-context", async () => {
      const sb = createAdminClient();
      const [businessRes, queriesRes] = await Promise.all([
        sb
          .from("audit_business_info")
          .select("brand_name, brand_aliases, geo_zone")
          .eq("audit_id", audit_id)
          .maybeSingle(),
        sb
          .from("queries")
          .select("id, text, category, position")
          .in("id", query_ids)
          .eq("audit_id", audit_id)
          .eq("source", "user"),
      ]);
      const result = {
        business: businessRes.data,
        queries: queriesRes.data ?? [],
      };
      console.log(
        `[run-manual-queries] fetch-context done : business=${!!result.business} brand_name=${result.business?.brand_name ?? "<missing>"} queries=${result.queries.length}`
      );
      return result;
    });

    if (!context.business || context.queries.length === 0) {
      console.warn(
        `[run-manual-queries] CONTEXT MISSING audit=${audit_id} business=${!!context.business} queries=${context.queries.length} — abort. Probable cause : queries inserees mais audit_business_info absent (rare), OU queries ne sont pas source='user' (race condition).`
      );
      return { success: false, reason: "context_missing" };
    }

    // Construit les VisibilityQuery avec id = id Supabase. Comme on
    // utilise les ids reels, le query_id_map est l'identite (lookup
    // map[key] ?? key renvoie key).
    const visQueries: VisibilityQuery[] = context.queries.map((q) => ({
      id: q.id,
      text: q.text,
      category: q.category,
      position: q.position,
    }));

    // Step 2 : fan-out par provider (4 step.run paralleles), comme le
    // pipeline principal. Si 1 IA crash, les autres sont deja
    // checkpointed.
    const providers: AIProvider[] = [
      "openai",
      "anthropic",
      "perplexity",
      "gemini",
    ];
    console.log(
      `[run-manual-queries] fan-out 4 providers x ${visQueries.length} queries = ${providers.length * visQueries.length} appels LLM`
    );
    const responsesPerProvider = await Promise.all(
      providers.map((provider) =>
        step.run(`manual-visibility-${provider}`, async () => {
          const tStart = Date.now();
          console.log(
            `[run-manual-queries] visibility-${provider} START (${visQueries.length} queries)`
          );
          const responses = await trackVisibility(visQueries, {
            brand_name: context.business!.brand_name,
            brand_aliases: context.business!.brand_aliases,
            geo_target: context.business!.geo_zone,
            audit_id,
            // Concurrency : 1 par provider (la trackVisibility filtre
            // sur only_provider donc on n'a que `visQueries.length`
            // taches max). Reduit a 2 pour eviter les rate-limits sur
            // les API qui throttlent agressivement (ex: Anthropic).
            concurrency: 2,
            verbose: false,
            only_provider: provider,
          });
          const errors = responses.filter((r) => r.error);
          console.log(
            `[run-manual-queries] visibility-${provider} DONE in ${Date.now() - tStart}ms — ${responses.length} responses, ${errors.length} errors${
              errors.length > 0
                ? ` (first error: ${errors[0].error?.slice(0, 120)})`
                : ""
            }`
          );
          return responses;
        })
      )
    );

    const allResponses = responsesPerProvider.flat();
    const totalErrors = allResponses.filter((r) => r.error).length;
    console.log(
      `[run-manual-queries] fan-out complete : ${allResponses.length} responses total, ${totalErrors} errors`
    );

    // Step 3 : persist ai_responses + analyses. query_id_map = identite
    // ({} marche : lookupQueryId fallback sur la cle si non trouvee).
    await step.run("manual-persist", async () => {
      console.log(
        `[run-manual-queries] persist START : ${allResponses.length} ai_responses + analyses`
      );
      await persistAiResponses({
        responses: allResponses,
        query_id_map: {},
      });
      console.log("[run-manual-queries] persist DONE");
    });

    const elapsedMs = Date.now() - t0;
    console.log(
      `[run-manual-queries] COMPLETE audit=${audit_id} in ${elapsedMs}ms — ${visQueries.length} queries, ${allResponses.length} responses (${totalErrors} errors)`
    );

    return {
      success: true,
      audit_id,
      query_ids,
      processed_count: visQueries.length,
      total_responses: allResponses.length,
      error_count: totalErrors,
      elapsed_ms: elapsedMs,
    };
  }
);
