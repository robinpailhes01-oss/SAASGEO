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
import type { QueryIdMap } from "./query-id-map";
import { parseUserGeoTarget } from "./geo-target";
import { resolveCityMain } from "./city-resolver";
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
  persistAuditHistory,
  persistRecommendations,
  finalizeAudit,
} from "./persistence";
import {
  computePresenceByCategory,
  buildCitedQueriesList,
} from "./evolution-helpers";

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
//
// `user_geo_target` est la ville fournie manuellement par l'utilisateur
// depuis le formulaire d'audit (audits.geo_target). Si presente, c'est
// une SOURCE AUTORITAIRE :
//   - injectee comme hint dans le prompt LLM ("verite premiere")
//   - override apres parse : on impose city/region/business_scope='local'
//     meme si le LLM a renvoye autre chose
// Cette logique evite que la detection foire silencieusement (cas
// principal observe en prod sur Harmonie Yacht ou le LLM Haiku
// renvoyait country='France' sans city, ce qui faisait fuir le
// placeholder "votre ville" dans les queries generees).
// =====================================================================
export async function stepExtractBusiness(args: {
  audit_id: string;
  url: string;
  technical: TechAuditResult;
  persist: boolean;
  user_geo_target?: string | null;
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

  const userHint =
    typeof args.user_geo_target === "string" && args.user_geo_target.trim()
      ? args.user_geo_target.trim()
      : null;

  const { system, prompt } = buildBrandExtractPrompt(text, args.url, userHint);
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
      city: null,
      region: null,
      country: null,
      business_scope: "national",
      detected_competitors: [],
      language: "fr",
    };
  }

  // Override autoritaire : si l'utilisateur a saisi une ville, on
  // remplace city/region/business_scope/geo_zone meme si le LLM a
  // renvoye autre chose (ex : LLM a vu "Hérault" mais user a precise
  // "Carnon, Hérault" -> on garde la version user, plus fine).
  //
  // Le parser detecte aussi un city_main_hint si le user a saisi une
  // grande ville reference dans son input (ex: "Carnon - Montpellier"
  // -> city_main_hint=Montpellier). Si present, on pre-set city_main —
  // le resolveur aval pourra confirmer / overrider.
  let userParsedCityMainHint: string | null = null;
  if (userHint) {
    const parsed = parseUserGeoTarget(userHint);
    userParsedCityMainHint = parsed.city_main_hint;
    business = {
      ...business,
      city: parsed.city,
      region: parsed.region ?? business.region,
      country: business.country ?? "France",
      geo_zone: business.geo_zone ?? userHint,
      city_main: parsed.city_main_hint ?? business.city_main ?? null,
      business_scope: "local",
    };
  }

  // Resolution city_main : grande ville de reference (>50k hab) la plus
  // proche. Critique pour la pertinence des queries (la majorite des
  // prospects cherchent "hotel Montpellier" pas "hotel Carnon"). Fait
  // un appel HTTP a api-adresse.data.gouv.fr puis Haversine sur la
  // liste statique MAJOR_CITIES_FR. Echec reseau -> null, le pipeline
  // continue et queries-gen fallback sur city_exact.
  //
  // IMPORTANT : on prefere geocoder le userHint COMPLET (s'il existe)
  // plutot que juste business.city. Sinon "Carnon" seul est ambigu —
  // il existe plusieurs Carnon en France et api-adresse pouvait
  // renvoyer un Carnon en Bretagne -> city_main=Brest. Avec le
  // userHint complet "Carnon - Montpellier" la geocodification
  // disambiguue correctement vers Carnon-Plage (Hérault).
  if (business.business_scope === "local") {
    const resolveQuery =
      (userHint && userHint.trim()) ||
      business.city ||
      business.geo_zone ||
      "";
    if (resolveQuery.trim()) {
      try {
        const resolved = await resolveCityMain(resolveQuery);
        if (resolved) {
          business = {
            ...business,
            city_main: resolved.name,
            // Si on n'a pas de region detectee mais le resolveur en a
            // une (region INSEE fiable), on l'utilise.
            region: business.region ?? resolved.region,
          };
        } else if (userParsedCityMainHint) {
          // Resolveur a echoue (network ou aucune ville >50k dans le
          // rayon) MAIS le user nous a explicitement donne un hint :
          // on garde son hint comme city_main de fallback.
          business = {
            ...business,
            city_main: userParsedCityMainHint,
          };
        }
      } catch (e) {
        console.warn(
          `[stepExtractBusiness] city_main resolve failed : ${e instanceof Error ? e.message : String(e)} (le pipeline continue${userParsedCityMainHint ? " avec le user hint" : " sans city_main"})`
        );
        if (userParsedCityMainHint) {
          business = { ...business, city_main: userParsedCityMainHint };
        }
      }
    }
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
// Construit les queries comparatives deterministes pour les concurrents
// connus saisis par le client (audits.competitors). Chaque concurrent
// declenche 2 queries non-branded (= comptees dans le score) :
//
//   1. "Alternatives a {C} pour {industry} a {city_main}"
//      -> teste si l'IA cite la marque comme alternative naturelle
//
//   2. "Que pensez-vous de {C} pour {industry} a {city_main} ?"
//      -> teste si l'IA connait meme {C} (souvent non pour les acteurs
//         locaux) ; si oui, peut-elle nous citer en comparaison ?
//
// Pourquoi DETERMINISTE plutot que via le LLM : on ne peut pas faire
// confiance au LLM pour orthographier exactement les noms de
// concurrents (eg "Click&Boat" -> "Click and Boat" ou "ClickBoat"),
// or notre matcher de competitors compte sur la graphie exacte. Et
// on veut une garantie 100% que toutes les queries demandees sont
// generees — pas un best-effort LLM.
function buildKnownCompetitorQueries(
  competitors: string[],
  business: BusinessInfo,
  startPosition: number
): VisibilityQuery[] {
  if (competitors.length === 0) return [];
  const isLocal = business.business_scope === "local";
  const lang = business.language === "en" ? "en" : "fr";
  const industry = (business.industry ?? "").trim();

  // Anchor geo : city_main pour local, sinon pas de geo (= national).
  const geoLabel = isLocal
    ? (business.city_main || business.city || business.region || "").trim()
    : "";
  const inGeo = (() => {
    if (!geoLabel) return "";
    return lang === "en" ? ` in ${geoLabel}` : ` à ${geoLabel}`;
  })();
  const forIndustry = (() => {
    if (!industry) return "";
    return lang === "en" ? ` for ${industry}` : ` pour ${industry}`;
  })();

  const queries: VisibilityQuery[] = [];
  let pos = startPosition;
  for (const raw of competitors) {
    const c = raw.trim();
    if (!c) continue;
    const q1 =
      lang === "en"
        ? `Alternatives to ${c}${forIndustry}${inGeo}`
        : `Alternatives à ${c}${forIndustry}${inGeo}`;
    const q2 =
      lang === "en"
        ? `What do you think of ${c}${forIndustry}${inGeo}?`
        : `Que pensez-vous de ${c}${forIndustry}${inGeo} ?`;
    queries.push({
      id: randomUUID(),
      text: q1,
      category: "comparative",
      position: pos++,
    });
    queries.push({
      id: randomUUID(),
      text: q2,
      category: "comparative",
      position: pos++,
    });
  }
  return queries;
}

export async function stepGenerateQueries(args: {
  audit_id: string;
  business: BusinessInfo;
  persist: boolean;
  // Mots-cles client (audits.keywords). Optionnel — si fourni,
  // le prompt LLM oriente les questions vers la vraie cible
  // ("Activite romantique en mer Montpellier" plutot que "Meilleur
  // charter Montpellier"). Aucun effet si vide.
  keywords?: string[];
  // Concurrents connus (audits.competitors). Si fourni, on appendra
  // 2 queries comparatives ciblees PAR concurrent au pipeline (max
  // 5 concurrents -> 10 queries supplementaires, total 30+10=40).
  // Cf. buildKnownCompetitorQueries.
  competitors?: string[];
}): Promise<{ queries: VisibilityQuery[]; query_id_map: QueryIdMap }> {
  if (args.persist) {
    await updateAuditStatus({
      audit_id: args.audit_id,
      status: "querying",
      progress: 40,
      current_step: "Generation 30 queries (LLM Sonnet)",
    });
  }

  const { system, prompt } = buildQueriesGenPrompt(args.business, {
    keywords: args.keywords,
  });
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

  // Filet de securite : detecte si le LLM a ressorti un placeholder
  // litteral ("votre ville", "[ville]", etc.) malgre l'instruction
  // INTERDIT du prompt. Si oui, on logge un warning visible — utile
  // pour reperer une regression du prompt sans casser l'audit.
  // Le rapport montrera des questions inadaptees ; mieux vaut le
  // savoir cote logs que silencieux.
  const PLACEHOLDER_RE =
    /\b(votre ville|votre region|votre département|\[ville\]|\[region\]|\[city\]|\[location\])\b/i;
  const allQueriesText = [
    ...parsed.branded,
    ...parsed.service,
    ...parsed.comparative,
  ];
  const offending = allQueriesText.filter((q) => PLACEHOLDER_RE.test(q));
  if (offending.length > 0) {
    console.warn(
      `[stepGenerateQueries] WARN ${offending.length} queries contiennent un placeholder geo non substitue : ${JSON.stringify(offending.slice(0, 3))}`
    );
  }

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

  // Append deterministe : queries ciblees pour les concurrents connus
  // (max 5 concurrents -> +10 queries comparatives non-branded). Ces
  // queries comptent dans le score (non-branded + locales si scope=local
  // et city_main present), et permettent de mesurer si les IA
  // connaissent les acteurs locaux que le client a indiques.
  if (args.competitors && args.competitors.length > 0) {
    const competitorQueries = buildKnownCompetitorQueries(
      args.competitors,
      args.business,
      pos
    );
    queries.push(...competitorQueries);
    pos += competitorQueries.length;
  }

  let query_id_map: QueryIdMap = {};
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
  query_id_map: QueryIdMap;
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
//
// `localScopeKeywords` (optionnel) : si fourni, le score est calcule
// UNIQUEMENT sur les queries mentionnant un de ces keywords. Sert pour
// les business `scope=local` ou les questions nationales sortent les
// IA a 0/100 et plombent la note. Cf. visibility-tracker.ts.
export async function stepAggregateVisibility(args: {
  audit_id: string;
  responses: VisibilityResponse[];
  query_id_map: QueryIdMap;
  persist: boolean;
  localScopeKeywords?: string[];
}): Promise<VisibilityScores> {
  const scores = computeVisibilityScores(args.responses, {
    localScopeKeywords: args.localScopeKeywords,
  });

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
  // Optionnel : si fourni, on persiste aussi un snapshot dans
  // audit_history pour la comparaison "vs precedent" (bloc Evolution).
  // url_normalized vient de audits.url_normalized (cf. createAudit).
  // queries + responses servent au calcul presence par categorie +
  // cited_queries normalises.
  history?: {
    url_normalized: string;
    queries: Array<{
      id: string;
      text: string;
      category: "branded" | "service" | "comparative";
    }>;
    responses: VisibilityResponse[];
  };
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

    // Snapshot historique (audit_history) — base pour le bloc Evolution.
    // On reconstruit responsesByQueryId pour les helpers purs.
    if (args.history) {
      const responsesByQueryId = new Map<
        string,
        Array<{ brand_mentioned: boolean | null }>
      >();
      for (const r of args.history.responses) {
        if (!r.analysis) continue;
        const list = responsesByQueryId.get(r.query_id) ?? [];
        list.push({ brand_mentioned: r.analysis.brand_mentioned });
        responsesByQueryId.set(r.query_id, list);
      }
      const presence = computePresenceByCategory({
        queries: args.history.queries,
        responsesByQueryId,
      });
      const citedQueries = buildCitedQueriesList({
        queries: args.history.queries,
        responsesByQueryId,
      });
      await persistAuditHistory({
        audit_id: args.audit_id,
        url_normalized: args.history.url_normalized,
        global_score,
        visibility_scores: args.visibility_scores,
        presence_branded: presence.branded,
        presence_service: presence.service,
        presence_comparative: presence.comparative,
        cited_queries: citedQueries,
      });
    }

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
//
// Responses (optionnel) : si fournies, on derive les "opportunites
// manquees" — queries ou la marque est absente alors qu'au moins un
// concurrent du top 5 est cite. Ces exemples concrets sont injectes
// dans le prompt pour forcer le LLM a generer des recommandations
// PERSONNALISEES (citent un concurrent reel ou une query precise) au
// lieu de blabla generique ("ameliorez votre presence").
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
  responses?: VisibilityResponse[];
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

  // Construction des opportunites manquees pour personnalisation reco.
  // Strategie : queries ou brand absente + au moins 1 concurrent cite.
  // Priorise les categories `comparative` > `service` > `branded` (plus
  // d'intention buying). Limite a 8 exemples (compact pour le prompt).
  const topCompetitorKeys = new Set(
    args.visibility_scores.top_competitors
      .slice(0, 10)
      .map((c) => c.name.toLowerCase().trim())
  );
  const categoryRank: Record<string, number> = {
    comparative: 0,
    service: 1,
    branded: 2,
  };
  const missedOpportunities = (args.responses ?? [])
    .filter((r) => {
      if (!r.analysis) return false;
      if (r.analysis.brand_mentioned) return false;
      if (!r.analysis.competitors_cited?.length) return false;
      // Privilegie les responses ou un competitor du top est cite
      return r.analysis.competitors_cited.some((c) =>
        topCompetitorKeys.has(c.toLowerCase().trim())
      );
    })
    .sort((a, b) => {
      const ca = categoryRank[a.query_category] ?? 99;
      const cb = categoryRank[b.query_category] ?? 99;
      if (ca !== cb) return ca - cb;
      // Provider preference : openai (ChatGPT) en premier
      const pa = a.provider === "openai" ? 0 : 1;
      const pb = b.provider === "openai" ? 0 : 1;
      return pa - pb;
    })
    .slice(0, 8)
    .map((r) => ({
      query: r.query_text,
      category: r.query_category,
      provider: r.provider as string,
      competitors_cited: r.analysis!.competitors_cited.slice(0, 3),
    }));

  const { system, prompt } = buildSynthesisPrompt({
    brand_name: args.business.brand_name,
    industry: args.business.industry,
    city: args.business.city,
    region: args.business.region,
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
    missed_opportunities: missedOpportunities,
  });

  const model = TASK_MODELS.synthesis;

  // ---------------------------------------------------------------
  // Robustification : si l'appel LLM Sonnet echoue (OpenRouter 402,
  // rate-limit, timeout, parse error...), on NE veut pas planter
  // tout l'audit alors que les 6 etapes precedentes ont reussi.
  //
  // Fallback : synthesis minimale -> persistence vide -> finalize OK
  // -> status='done'. Le rapport affichera les FALLBACK_RECOS
  // templatees (cf. lib/report/get-report.ts) comme si on avait < 3
  // recommandations en DB. Le user voit son rapport, on ne perd pas
  // l'audit.
  //
  // maxTokens reduit a 1800 (vs 3000 avant) pour tolerer un crédit
  // OpenRouter bas (cas observe : 402 "can only afford 1631 tokens").
  // 1800 tokens suffisent pour 5-10 recommandations + verdict.
  // ---------------------------------------------------------------
  let llmResult: Awaited<ReturnType<typeof generateText>> | null = null;
  let llmError: string | null = null;
  try {
    llmResult = await generateText(model, {
      system,
      prompt,
      temperature: 0.3,
      jsonMode: true,
      maxTokens: 1800,
    });
  } catch (e) {
    llmError = e instanceof Error ? e.message : String(e);
    console.warn(
      `[pipeline-steps] synthesis LLM call failed (fallback enclenche) : ${llmError}`
    );
  }

  if (llmResult) {
    await trackApiCall({
      user_id: process.env.ADMIN_USER_ID ?? null,
      audit_id: args.audit_id,
      provider: modelToProvider(model),
      model,
      tokens_in: llmResult.tokens_in,
      tokens_out: llmResult.tokens_out,
      request_type: "synthesis",
      actual_cost_usd: llmResult.cost_usd,
    });
  }

  let synthesis: Synthesis;
  if (llmResult) {
    try {
      synthesis = SynthesisSchema.parse(JSON.parse(llmResult.text));
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
  } else {
    // LLM call failed (402, network, rate-limit...). Fallback minimal
    // qui laisse get-report.ts servir les FALLBACK_RECOS templatees.
    synthesis = {
      verdict:
        "Audit complet. Plan d'action détaillé disponible en consultation.",
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
