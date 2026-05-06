// =====================================================================
// Visibility tracker : execute 30 queries x 4 providers = 120 appels
// LLM en parallele (avec concurrence bornee a 8 pour eviter les rate
// limits) puis analyse chaque reponse via brand-mention detection.
//
// Sortie : ai_responses + ai_response_analysis pour l'audit.
//
// Cout estime par audit :
//   - 30 x openai/gpt-4o      : ~0.20€
//   - 30 x anthropic/claude-sonnet-4-5 : ~0.30€
//   - 30 x perplexity/sonar   : ~0.40€
//   - 30 x google/gemini-2.5-flash : ~0.05€ (ou 0 via direct)
//   = ~0.95€ visibility seul
//   - 120 x analyses Haiku    : ~0.12€
//   = ~1.07€ pour la partie visibility
// =====================================================================

import type { AIProvider } from "./types";
import { generateText } from "./providers";
import { VISIBILITY_MODELS, modelToProvider } from "./models";
import { trackApiCall } from "./cost-tracker";
import { detectMentionFull, type FullMentionResult } from "./detection/brand-mention";

export interface VisibilityQuery {
  id: string;                       // uuid de la query (queries.id Supabase)
  text: string;
  category: "branded" | "service" | "comparative";
  position: number;
}

export interface VisibilityResponse {
  query_id: string;
  query_text: string;
  query_category: string;
  provider: AIProvider;
  model: string;
  response_text: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  cost_eur: number;
  latency_ms: number;
  sources: { url: string; title?: string }[];
  error?: string;
  // Analyse mention apres traitement
  analysis: FullMentionResult | null;
  // Cout cumule (visibility + analysis)
  total_cost_eur: number;
  // Index du pass (1..N) pour le multi-pass. Permet de stocker
  // plusieurs reponses par (query, provider) et de mesurer la variance
  // stochastique des LLM. Cf. PASSES_PER_CATEGORY.
  pass_index: number;
}

// Multi-pass : nombre d'executions independantes de la meme query
// par le meme provider, en fonction de la categorie. Plus la
// categorie est volatile (listy, comparative), plus on multiplie les
// passes pour stabiliser la mesure.
//
// Variance observee (T=0.7, conditions par defaut des chats) :
//   - branded   : tres faible — l'IA connait ou pas la marque,
//                 reponses ~80% identiques d'un appel a l'autre
//   - service   : moyenne — listes courtes, 2-3 candidats peuvent
//                 sortir alternativement
//   - comparative : forte — "top 5 X a Y" peut produire 5+ reponses
//                 differentes legerement chevauchantes. C'est la
//                 categorie la plus exposee a la stochasticite
//                 perçue par l'utilisateur final ("hier ChatGPT
//                 m'avait cite, aujourd'hui non")
//
// Cout total visibility tracking avec ces ratios :
//   10 branded x 1 + 10 service x 2 + 10 comparative x 3 = 60
//   x 4 IA = 240 calls (vs 120 avant) ~= cout 2x.
//
// Si le nombre de queries augmente (manual / known_competitor
// injectees), le ratio reste identique : N passes par categorie.
export const PASSES_PER_CATEGORY: Record<
  VisibilityQuery["category"],
  number
> = {
  branded: 1,
  service: 2,
  comparative: 3,
};

interface RunOptions {
  brand_name: string;
  brand_aliases: string[];
  geo_target?: string | null;
  audit_id?: string | null;
  // Concurrence max d'appels simultanes (par defaut 8)
  concurrency?: number;
  // Verbose : log chaque progression
  verbose?: boolean;
  // Optionnel : filtre sur un seul provider (utilise par Inngest fan-out
  // pour parallelisation par provider). Si absent : tous les 4 providers.
  only_provider?: AIProvider;
  // Override du nombre de passes (multi-pass). Si fourni, applique a
  // toutes les queries quelle que soit la categorie. Sinon : on suit
  // PASSES_PER_CATEGORY. Use case : manual queries (1 query a la fois,
  // cout doit rester minime) — on force passes=1.
  passes_override?: number;
}

// Limiteur de concurrence simple : execute des taches en parallele
// avec un cap sur le nombre simultane.
async function runConcurrent<T, R>(
  items: T[],
  fn: (item: T, idx: number) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}

// Construit le prompt envoye a l'IA pour simuler une question user.
// On ne met PAS de system prompt orientant — on veut simuler ce qu'un
// utilisateur lambda obtiendrait en chat libre.
function buildVisibilityPrompt(query: string, geo_target?: string | null): {
  system?: string;
  prompt: string;
} {
  // Geo context : si la query ne mentionne pas deja la zone et qu'on
  // a un geo_target, on l'ajoute en contexte naturel.
  const geoSuffix =
    geo_target && !query.toLowerCase().includes(geo_target.toLowerCase())
      ? ` (depuis ${geo_target})`
      : "";

  return {
    // Pas de system prompt → reponse "raw" comme un user lambda
    prompt: `${query}${geoSuffix}`,
  };
}

// Execute UNE query sur UN provider (UN pass) et retourne la reponse +
// analyse. pass_index est purement informatif — chaque call est
// independant cote LLM, c'est la stochasticite naturelle qui produit
// les variations entre passes.
async function trackOne(args: {
  query: VisibilityQuery;
  provider: AIProvider;
  pass_index: number;
  brand_name: string;
  brand_aliases: string[];
  geo_target?: string | null;
  audit_id?: string | null;
}): Promise<VisibilityResponse> {
  const { query, provider, pass_index } = args;
  const model = VISIBILITY_MODELS[provider];
  const promptArgs = buildVisibilityPrompt(query.text, args.geo_target);

  const t0 = Date.now();
  let response_text = "";
  let tokens_in = 0;
  let tokens_out = 0;
  let cost_usd = 0;
  let cost_eur = 0;
  let latency_ms = 0;
  let sources: { url: string; title?: string }[] = [];
  let error: string | undefined;

  try {
    const r = await generateText(model, {
      ...promptArgs,
      temperature: 0.7,
      maxTokens: 600,
    });
    response_text = r.text;
    tokens_in = r.tokens_in;
    tokens_out = r.tokens_out;
    cost_usd = r.cost_usd;
    cost_eur = r.cost_eur;
    latency_ms = r.latency_ms;
    sources = r.sources ?? [];

    // Track le cost de la visibility query
    await trackApiCall({
      user_id: process.env.ADMIN_USER_ID ?? null,
      audit_id: args.audit_id ?? null,
      provider,
      model,
      tokens_in,
      tokens_out,
      request_type: "visibility_query",
      actual_cost_usd: cost_usd,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    latency_ms = Date.now() - t0;
  }

  // Analyse mention si on a une reponse
  let analysis: FullMentionResult | null = null;
  if (response_text && !error) {
    try {
      analysis = await detectMentionFull({
        brand_name: args.brand_name,
        brand_aliases: args.brand_aliases,
        query: query.text,
        ai_response: response_text,
        audit_id: args.audit_id,
      });
    } catch (e) {
      console.warn(
        `[visibility] analysis failed pour ${provider}/${query.text.slice(0, 50)} : ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  const total_cost_eur = cost_eur + (analysis?.llm_cost_eur ?? 0);

  return {
    query_id: query.id,
    query_text: query.text,
    query_category: query.category,
    provider,
    model,
    response_text,
    tokens_in,
    tokens_out,
    cost_usd,
    cost_eur,
    latency_ms,
    sources,
    error,
    analysis,
    total_cost_eur,
    pass_index,
  };
}

// Lance le tracking complet : queries x providers en parallele bornee.
export async function trackVisibility(
  queries: VisibilityQuery[],
  opts: RunOptions
): Promise<VisibilityResponse[]> {
  const concurrency = opts.concurrency ?? 8;
  const verbose = opts.verbose ?? true;

  const providers: AIProvider[] = opts.only_provider
    ? [opts.only_provider]
    : ["openai", "anthropic", "perplexity", "gemini"];

  // Multi-pass : pour chaque (query, provider), on cree N taches
  // independantes selon PASSES_PER_CATEGORY[query.category]. Chaque
  // pass est un appel LLM autonome — la variance vient de la
  // stochasticite naturelle des LLM (sampling, temperature 0.7).
  const allTasks: Array<{
    query: VisibilityQuery;
    provider: AIProvider;
    pass_index: number;
  }> = [];
  for (const q of queries) {
    const passes =
      typeof opts.passes_override === "number" && opts.passes_override > 0
        ? opts.passes_override
        : PASSES_PER_CATEGORY[q.category] ?? 1;
    for (const p of providers) {
      for (let i = 1; i <= passes; i++) {
        allTasks.push({ query: q, provider: p, pass_index: i });
      }
    }
  }

  if (verbose) {
    const passesSummary = Object.entries(PASSES_PER_CATEGORY)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    console.log(
      `[visibility] ${queries.length} queries x ${providers.length} providers x multi-pass (${passesSummary}) = ${allTasks.length} appels (concurrence ${concurrency})`
    );
  }

  let done = 0;
  const startTime = Date.now();
  const responses = await runConcurrent(
    allTasks,
    async (task) => {
      const r = await trackOne({
        ...task,
        brand_name: opts.brand_name,
        brand_aliases: opts.brand_aliases,
        geo_target: opts.geo_target,
        audit_id: opts.audit_id,
      });
      done += 1;
      if (verbose && done % 20 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        console.log(`[visibility]   ${done}/${allTasks.length} (${elapsed}s)`);
      }
      return r;
    },
    concurrency
  );

  if (verbose) {
    const totalCost = responses.reduce((a, r) => a + r.total_cost_eur, 0);
    const errors = responses.filter((r) => r.error).length;
    console.log(
      `[visibility] termine en ${((Date.now() - startTime) / 1000).toFixed(1)}s — cost ${totalCost.toFixed(4)}€, ${errors} erreur(s)`
    );
  }

  return responses;
}

// Calcule les scores de visibility a partir des responses analysees.
export interface VisibilityScores {
  // Score global /100 : moyenne ponderee des 4 providers (25 chacun)
  global_score: number;
  // Score par provider /100
  per_provider: Record<AIProvider, number>;
  // % de queries ou la marque est mentionnee textuellement
  mention_rate: number;
  // % de queries ou la marque est citee comme source
  citation_rate: number;
  // Top concurrents detectes (frequence)
  top_competitors: Array<{ name: string; count: number }>;
}

export function computeVisibilityScores(
  responses: VisibilityResponse[],
  options?: {
    // Si fourni, le score est calcule UNIQUEMENT sur les responses
    // dont la query mentionne au moins un de ces keywords (case-
    // insensitive). Sert pour les business `scope=local` ou on veut
    // mesurer la visibilite SUR LE MARCHE LOCAL plutot que national.
    //
    // Cas Harmonie Yacht (Carnon/Montpellier/Hérault) : les 3-4
    // questions nationales ("top 5 charters France") sortaient
    // ChatGPT/Claude/Gemini a 0/100 — ces queries plombaient la note.
    // En filtrant local, on mesure ce qui compte vraiment pour le
    // commerce.
    //
    // Les questions hors local restent dans le rapport (visibles dans
    // AllQueriesPanel section "national") mais n'impactent plus le
    // score officiel.
    //
    // top_competitors reste calcule sur TOUTES les responses (pour la
    // coherence du podium qui doit montrer les vrais concurrents
    // nationaux qui prennent la place de la marque).
    localScopeKeywords?: string[];
  }
): VisibilityScores {
  const providers: AIProvider[] = ["openai", "anthropic", "perplexity", "gemini"];
  const per_provider: Record<AIProvider, number> = {
    openai: 0,
    anthropic: 0,
    perplexity: 0,
    gemini: 0,
  };

  // EXCLUSION des questions BRANDED pour le calcul du score principal.
  //
  // Justification : une question branded ("Avis sur Harmonie Yacht",
  // "Harmonie Yacht tarifs") contient deja le nom de la marque dans
  // le texte. Si l'IA cite la marque dans sa reponse, c'est attendu
  // — ca ne mesure pas la VRAIE visibilite commerciale (apparaitre
  // quand un client cherche un service SANS connaitre la marque).
  //
  // Ne sont gardees pour le score : les categories `service` et
  // `comparative` (~20 questions sur 30). Les `branded` restent dans
  // les responses brutes (donc dans top_competitors et l'affichage
  // AllQueriesPanel sous label "Notoriete") mais ne pesent plus dans
  // le score 0-100 ni dans mention_rate / citation_rate / per_provider.
  //
  // Cf. brief change "Exclure les questions branded du score principal".
  let scoreResponses = responses.filter(
    (r) => r.query_category !== "branded"
  );

  // FILTRE GEO LOCAL (optionnel) : si options.localScopeKeywords est
  // fourni et non vide, garde uniquement les queries qui mentionnent
  // au moins un des keywords (case-insensitive). Cf. JSDoc options
  // ci-dessus.
  const localKeys = (options?.localScopeKeywords ?? [])
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0);
  if (localKeys.length > 0) {
    scoreResponses = scoreResponses.filter((r) => {
      const text = (r.query_text ?? "").toLowerCase();
      return localKeys.some((k) => text.includes(k));
    });
  }

  // Pour chaque provider : on calcule un sub-score sur les responses
  // FILTREES (non-branded, eventuellement non-national).
  // Formule : pour chaque query, points = 0/25/50/75/100 selon :
  //   - 100 : mentionne EN PREMIER + sentiment positif
  //   -  75 : mentionne en top 3 + sentiment positif/neutre
  //   -  50 : mentionne (n'importe ou) + sentiment positif/neutre
  //   -  25 : mentionne mais sentiment negatif
  //   -   0 : non mentionne
  for (const provider of providers) {
    const perProvider = scoreResponses.filter(
      (r) => r.provider === provider
    );
    if (perProvider.length === 0) continue;
    let sum = 0;
    for (const r of perProvider) {
      const a = r.analysis;
      if (!a || !a.brand_mentioned) {
        sum += 0;
      } else if (a.mention_position === 1 && a.sentiment === "positive") {
        sum += 100;
      } else if (
        a.mention_position !== null &&
        a.mention_position <= 3 &&
        (a.sentiment === "positive" || a.sentiment === "neutral")
      ) {
        sum += 75;
      } else if (
        (a.sentiment === "positive" || a.sentiment === "neutral")
      ) {
        sum += 50;
      } else if (a.sentiment === "negative") {
        sum += 25;
      } else {
        sum += 50; // mentionne mais sentiment null → neutre par defaut
      }
    }
    per_provider[provider] = Math.round(sum / perProvider.length);
  }

  // Score global = moyenne des 4 providers (chaque provider pese 25%)
  const global_score = Math.round(
    (per_provider.openai + per_provider.anthropic +
     per_provider.perplexity + per_provider.gemini) / 4
  );

  // Mention rate / citation rate calcules SUR LES MEMES responses
  // filtrees que le score (coherence : tous les indicateurs derivent
  // de la meme base "non-branded").
  const totalAnalyzed = scoreResponses.filter((r) => r.analysis !== null).length;
  const mentions = scoreResponses.filter((r) => r.analysis?.brand_mentioned).length;
  const citations = scoreResponses.filter(
    (r) => r.analysis?.brand_citation_present
  ).length;
  const mention_rate = totalAnalyzed > 0 ? (mentions / totalAnalyzed) * 100 : 0;
  const citation_rate = totalAnalyzed > 0 ? (citations / totalAnalyzed) * 100 : 0;

  // Top competitors : on garde TOUTES les responses (y compris branded)
  // pour cette agregation. Un concurrent cite dans une question branded
  // ("Que vaut Harmonie Yacht ?") reste un signal interessant — c'est
  // typiquement la qu'une IA propose des "alternatives a la marque",
  // ce qui revele les vrais concurrents directs. Seul le score
  // numerique exclut les branded (cf. justification plus haut).
  const compFreq = new Map<string, number>();
  for (const r of responses) {
    if (!r.analysis) continue;
    for (const c of r.analysis.competitors_cited) {
      const norm = c.trim();
      if (!norm) continue;
      compFreq.set(norm, (compFreq.get(norm) ?? 0) + 1);
    }
  }
  const top_competitors = Array.from(compFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  return {
    global_score,
    per_provider,
    mention_rate,
    citation_rate,
    top_competitors,
  };
}
