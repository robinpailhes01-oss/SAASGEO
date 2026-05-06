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
//
// REGLE D'OR INNGEST :
//   Inngest replay la fonction entiere a chaque step boundary. Tout
//   code hors step.run() RE-EXECUTE a chaque replay, y compris le
//   replay final apres que le dernier step ait resolu.
//   -> Les writes en DB DOIVENT etre dans step.run() sinon ils
//      ecrasent les ecritures faites par les steps suivants. Bug
//      reproduit en prod sur audit 95c2353d-... ou la status restait
//      a "querying/55" alors que finalize avait deja ecrit "done/100",
//      parce qu'un updateAuditStatus en dehors de step.run() etait
//      execute une derniere fois sur le replay final.
//   -> Les reads peuvent rester hors step.run() si le cout est nul,
//      mais on les wrap quand meme par precaution (ex: alertes
//      budget qui pourraient etre dupliquees a chaque replay).
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
  // Mots-cles client (audits.keywords) injectes dans queries-gen.
  // Optionnel — si vide, comportement original generique par secteur.
  keywords?: string[];
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
    const { audit_id, url, geo_target, keywords } = event.data;

    try {
      // Budget check : wrap dans step.run() pour ne tourner qu'une fois
      // (evite N+1 reads sur les replays).
      const budgetBefore = await step.run("budget-check", () =>
        ensureBudgetAvailable()
      );

      // -------- Step 1 : Tech audit --------
      const technical = await step.run("tech-audit", () =>
        stepTechAudit({ audit_id, url, persist: true })
      );

      // -------- Step 2 : Extract business --------
      // On passe geo_target (saisi par l'utilisateur depuis le
      // formulaire) comme source autoritaire pour la localisation.
      // Si present, le pipeline force business_scope='local' et
      // utilise cette valeur pour city/region — meme si le LLM
      // Haiku ne detecte rien depuis le HTML.
      const business = await step.run("extract-business", () =>
        stepExtractBusiness({
          audit_id,
          url,
          technical,
          persist: true,
          user_geo_target: geo_target,
        })
      );

      // -------- Step 3 : Generate queries --------
      const queriesResult = await step.run("generate-queries", () =>
        stepGenerateQueries({
          audit_id,
          business,
          persist: true,
          keywords: keywords && keywords.length > 0 ? keywords : undefined,
        })
      );

      // -------- Step 4 : Visibility tracking — fan-out 4 providers en parallele --------
      // Chaque provider tourne dans son propre step.run avec retries natifs.
      // Si Anthropic crash, OpenAI / Perplexity / Gemini deja checkpointed.
      //
      // Note serialisation Inngest : `query_id_map` est un Record<string,
      // string> (plain object) — directement JSON-serialisable. Cf.
      // lib/ai/query-id-map.ts pour le contrat et le helper defensif.
      const queryIdMap = queriesResult.query_id_map;

      // Update status avant le fan-out — DOIT etre dans step.run() sinon
      // re-execute a chaque replay et ecrase le done/100 final.
      await step.run("update-status-fanout", () =>
        updateAuditStatus({
          audit_id,
          status: "querying",
          progress: 55,
          current_step: "Visibility tracking — fan-out 4 IA en parallele",
        })
      );

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
      // Si business `scope=local`, on calcule le score UNIQUEMENT sur
      // les queries qui mentionnent city_main / city / region — c'est
      // la performance qui compte pour un commerce local. Les queries
      // nationales restent dans le rapport (AllQueriesPanel) mais ne
      // pesent plus dans le score qui sortait sinon a ~10/100 a cause
      // de queries ou la marque locale n'a aucune chance contre les
      // leaders nationaux.
      const allResponses = responsesPerProvider.flat();
      const localScopeKeywords =
        business.business_scope === "local"
          ? [business.city_main, business.city, business.region]
              .map((s) => (typeof s === "string" ? s.trim() : ""))
              .filter((s) => s.length > 0)
          : undefined;
      const visibilityScores = await step.run("aggregate-visibility", () =>
        stepAggregateVisibility({
          audit_id,
          responses: allResponses,
          query_id_map: queryIdMap,
          persist: true,
          localScopeKeywords,
        })
      );

      // -------- Step 5 : Compute scores --------
      // On passe aussi `history` (queries + responses + url_normalized)
      // pour que stepComputeScores persiste un snapshot dans
      // audit_history. Ce snapshot sert au calcul "vs precedent" du
      // bloc Evolution dans le rapport.
      const urlNormalized = (() => {
        try {
          const u = new URL(url);
          return u.origin + u.pathname;
        } catch {
          return url;
        }
      })();
      const scores = await step.run("compute-scores", () =>
        stepComputeScores({
          audit_id,
          technical,
          visibility_scores: visibilityScores,
          persist: true,
          history: {
            url_normalized: urlNormalized,
            queries: queriesResult.queries.map((q) => ({
              id: q.id,
              text: q.text,
              category: q.category,
            })),
            responses: allResponses,
          },
        })
      );

      // -------- Step 6 : Synthesis --------
      // On passe `responses` pour permettre la generation de
      // recommandations PERSONNALISEES (qui citent une query manquee
      // precise + un concurrent reel detecte) plutot que generiques.
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
          responses: allResponses,
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

      // Post-audit : alertes budget. Wrap dans step.run() pour que
      // l'envoi d'alerte ne soit declenche QU'UNE seule fois (eviter
      // les alertes dupliquees si Inngest replay la fonction).
      await step.run("budget-alerts", async () => {
        const budgetAfter = await getMonthToDateSpend();
        await checkAndAlertThresholds({
          total_before_eur: budgetBefore.current_total_eur,
          total_after_eur: budgetAfter,
        });
        return { budgetAfter };
      });

      // Le retour de la fonction est juste un payload de log Inngest —
      // les valeurs precises ne sont pas critiques (cost_eur etc.). On
      // ne les recalcule pas ici pour eviter de tirer un autre read DB
      // hors step.run().
      return {
        success: true,
        audit_id,
        global_score: scores.global_score,
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
