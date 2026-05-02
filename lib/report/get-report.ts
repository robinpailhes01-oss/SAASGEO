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
  normalizeCompetitorKey,
  scoreTone,
  type AIProvider,
  type AIResponseSample,
  type CompetitorRanking,
  type PriorityAction,
  type ProviderScore,
  type QueryCategory,
  type RecommendationsSummary,
  type ReportData,
  type WhyReason,
} from "./types";

export type {
  AIResponseSample,
  CompetitorRanking,
  PriorityAction,
  ProviderScore,
  RecommendationsSummary,
  ReportData,
  WhyReason,
} from "./types";
export {
  scoreTone,
  PROVIDER_LABELS,
  PROVIDER_COLORS,
  PROVIDER_ORDER,
} from "./types";

// ---------------------------------------------------------------------
// Phase D.3 helpers : pourquoi invisible + actions prioritaires
// ---------------------------------------------------------------------

type TechCheck = {
  label: string;
  status?: "pass" | "warn" | "fail";
  recommendation?: string;
};

// Detecte la cause technique majeure a partir des checks failed/warned.
// Ordre de priorite : llms.txt > sitemap > robots > schema/structured > 1ere
// failed restante > fallback generique.
function deriveTechnicalReason(failedChecks: TechCheck[]): {
  title: string;
  subtitle: string;
} {
  const labels = failedChecks.map((c) => (c.label ?? "").toLowerCase());
  const has = (needle: string) => labels.some((l) => l.includes(needle));

  if (has("llms.txt") || has("llm.txt")) {
    return {
      title: "Aucun fichier llms.txt sur votre site",
      subtitle:
        "Sans ce fichier, les IA ne savent pas comment lire votre offre rapidement.",
    };
  }
  if (has("sitemap")) {
    return {
      title: "Sitemap.xml manquant ou mal configuré",
      subtitle:
        "Les IA n'arrivent pas à indexer toutes vos pages importantes.",
    };
  }
  if (has("robots")) {
    return {
      title: "Fichier robots.txt mal configuré",
      subtitle:
        "Les robots IA (GPTBot, ClaudeBot…) sont peut-être bloqués par votre site.",
    };
  }
  if (has("schema") || has("structured") || has("jsonld") || has("json-ld")) {
    return {
      title: "Données structurées absentes de vos pages",
      subtitle:
        "Sans balisage Schema.org, les IA ne savent pas ce que vous vendez exactement.",
    };
  }
  // Fallback : on prend le 1er failed comme titre s'il existe
  const first = failedChecks[0];
  if (first && first.label) {
    return {
      title: first.label,
      subtitle:
        "Les IA ne peuvent pas accéder correctement à votre site pour vous citer.",
    };
  }
  return {
    title: "Configuration technique incomplète pour les IA",
    subtitle:
      "Plusieurs prérequis ne sont pas en place pour que les IA vous lisent.",
  };
}

// Construit les 3 raisons du bloc "Pourquoi vous etes invisible".
// Si le score est >= 70, on inverse le ton (raisons positives).
function buildWhyReasons(
  globalScore: number,
  failedChecks: TechCheck[]
): WhyReason[] {
  const tone = scoreTone(globalScore);
  if (tone === "high") {
    return [
      {
        slot: "technical",
        title: "Vos fondations techniques sont en place",
        subtitle:
          "Les IA peuvent lire votre site sans friction (sitemap, robots, balisage).",
      },
      {
        slot: "authority",
        title: "Votre marque est mentionnée par les bonnes sources",
        subtitle:
          "Wikipedia, presse spécialisée, annuaires sectoriels : les IA vous trouvent partout.",
      },
      {
        slot: "content",
        title: "Votre contenu adresse les bonnes questions",
        subtitle:
          "Vos pages répondent aux questions exactes que se posent vos clients.",
      },
    ];
  }
  return [
    {
      slot: "technical",
      ...deriveTechnicalReason(failedChecks),
    },
    {
      slot: "authority",
      title: "Faible présence sur les sites cités par les IA",
      subtitle:
        "Les IA s'appuient sur Wikipedia, la presse et les annuaires sectoriels — où vous n'apparaissez pas encore.",
    },
    {
      slot: "content",
      title: "Votre contenu n'adresse pas les questions exactes de vos clients",
      subtitle:
        "Les IA cherchent des FAQ détaillées, des fiches services et des comparatifs précis.",
    },
  ];
}

// Genere le label d'impact d'une recommendation EN LANGAGE BUSINESS.
// Format : "Yh de travail · +X clients/mois estimés"
//
// Mapping :
//   - effort selon priority :
//       quick_win  -> "2h"     (chose qui se fait dans la journee)
//       medium     -> "1 jour" (qq heures sur 2-3 jours)
//       long_term  -> "1 sem"  (chantier non trivial)
//   - clients/mois : impact_score (1-10) x 3 -> [3..30] clients estimes.
//     Hypothese pedagogique d'un commerce local moyen : 1 unite d'impact
//     LLM ~= 3 clients/mois. C'est volontairement arrondi et libelle
//     "estimes" pour rester honnete (la valeur reelle depend du
//     volume de recherche du secteur, qu'on n'a pas mesure ici).
function impactLabel(
  priority: "quick_win" | "medium" | "long_term",
  impactScore: number
): string {
  const effort =
    priority === "quick_win"
      ? "2h"
      : priority === "medium"
      ? "1 jour"
      : "1 sem";
  const clients = Math.max(3, Math.min(30, Math.round(impactScore * 3)));
  return `${effort} de travail · +${clients} clients/mois estimés`;
}

// Tronque une description proprement sur le dernier espace avant la limite.
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > max * 0.7 ? slice.slice(0, lastSpace) : slice).trimEnd() + "…";
}

// Recommandations templatees de fallback (cas <3 recos en DB).
// V2 : langage business, sans jargon. Format aligne sur le prompt
// synthesis ("[Ce que vous perdez]" puis "[Action en simple]").
const FALLBACK_RECOS: PriorityAction[] = [
  {
    position: 1,
    title: "Vos concurrents apparaissent à votre place sur les questions IA",
    description:
      "Ajoutez sur votre site un fichier court qui explique votre activité aux IA — comme une fiche d'identité visible par ChatGPT, Claude et leurs concurrents. Pas besoin de développeur.",
    impact_label: "2h de travail · +15 clients/mois estimés",
  },
  {
    position: 2,
    title: "Vos pages ne répondent pas aux questions exactes des clients",
    description:
      "Créez 1 page par question type que posent vos clients (ex: 'séjour romantique à votre ville'). Les IA piochent les pages qui répondent précisément à ces requêtes.",
    impact_label: "1 jour de travail · +18 clients/mois estimés",
  },
  {
    position: 3,
    title: "Les sites cités par les IA ne parlent pas de vous",
    description:
      "Demandez à être référencé sur les annuaires et la presse locale qu'utilisent les IA pour citer des marques — Google, Pages Jaunes, presse régionale, blogs sectoriels.",
    impact_label: "1 sem de travail · +15 clients/mois estimés",
  },
];

const PRIORITY_RANK: Record<"quick_win" | "medium" | "long_term", number> = {
  quick_win: 0,
  medium: 1,
  long_term: 2,
};

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

  // Etape 1 : audit + scores + business + queries + technical + recos (parallele).
  const [
    auditRes,
    scoresRes,
    businessRes,
    queriesRes,
    technicalRes,
    recosRes,
  ] = await Promise.all([
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
      .select("brand_name, industry, geo_zone, city, city_main, region, country, business_scope")
      .eq("audit_id", auditId)
      .maybeSingle(),
    sb.from("queries").select("id").eq("audit_id", auditId),
    sb
      .from("audit_technical")
      .select("category, score, checks")
      .eq("audit_id", auditId),
    sb
      .from("audit_recommendations")
      .select("title, description, priority, impact_score, position")
      .eq("audit_id", auditId)
      .order("position", { ascending: true }),
  ]);

  if (auditRes.error || !auditRes.data) return null;

  const audit = auditRes.data;
  const scores = scoresRes.data;
  const business = businessRes.data;
  const queryIds = (queriesRes.data ?? []).map((q) => q.id);
  const total_queries = queryIds.length;
  const technicalRows = technicalRes.data ?? [];
  const recoRows = recosRes.data ?? [];

  // ---------------------------------------------------------------
  // Phase D.3 : pourquoi invisible (failed checks aplaties)
  // ---------------------------------------------------------------
  const failedChecks: TechCheck[] = [];
  for (const cat of technicalRows) {
    const checks = Array.isArray(cat.checks) ? (cat.checks as unknown[]) : [];
    for (const raw of checks) {
      if (!raw || typeof raw !== "object") continue;
      const c = raw as Record<string, unknown>;
      const status = c.status as TechCheck["status"] | undefined;
      const label = typeof c.label === "string" ? c.label : "";
      if (!label) continue;
      if (status === "fail" || status === "warn") {
        failedChecks.push({
          label,
          status,
          recommendation:
            typeof c.recommendation === "string" ? c.recommendation : undefined,
        });
      }
    }
  }
  const why_reasons = buildWhyReasons(scores?.global_score ?? 0, failedChecks);

  // ---------------------------------------------------------------
  // Phase D.3 : actions prioritaires (top 3 + total count)
  // ---------------------------------------------------------------
  const sortedRecos = [...recoRows].sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority] ?? 99;
    const pb = PRIORITY_RANK[b.priority] ?? 99;
    if (pa !== pb) return pa - pb;
    if (a.impact_score !== b.impact_score) return b.impact_score - a.impact_score;
    return (a.position ?? 99) - (b.position ?? 99);
  });
  const top3FromDb: PriorityAction[] = sortedRecos.slice(0, 3).map((r, i) => ({
    position: i + 1,
    title: r.title,
    description: truncate(r.description ?? "", 120),
    impact_label: impactLabel(r.priority, r.impact_score),
  }));
  // Si moins de 3 recos en DB, on complete avec les fallback templates.
  const top3: PriorityAction[] = [...top3FromDb];
  for (let i = top3.length; i < 3; i++) {
    top3.push({ ...FALLBACK_RECOS[i], position: i + 1 });
  }
  const recommendations: RecommendationsSummary = {
    top3,
    total_count: recoRows.length,
  };

  // Etape 2 : ai_responses + ai_response_analysis pour les 30 queries.
  // On fetch aussi le texte des queries (text + category) pour les
  // apercus IA. Trois requetes parallelisees.
  let total_responses = 0;
  let brand_mentions_count = 0;
  let top_competitors: CompetitorRanking[] = [];
  let your_mentions_count = 0;
  let samples: AIResponseSample[] = [];

  if (queryIds.length > 0) {
    const [queriesFullRes, responsesRes] = await Promise.all([
      sb
        .from("queries")
        .select("id, text, category, position")
        .in("id", queryIds),
      sb
        .from("ai_responses")
        .select("id, provider, query_id, raw_response, error_message")
        .in("query_id", queryIds),
    ]);

    const queriesById = new Map<
      string,
      { id: string; text: string; category: QueryCategory; position: number }
    >();
    for (const q of queriesFullRes.data ?? []) {
      queriesById.set(q.id, q);
    }

    const responses = responsesRes.data ?? [];
    const responseIds = responses.map((r) => r.id);
    const responsesById = new Map(responses.map((r) => [r.id, r]));

    let analyses: Array<{
      response_id: string;
      brand_mentioned: boolean | null;
      competitors_cited: string[] | null;
      mention_position: number | null;
    }> = [];
    if (responseIds.length > 0) {
      const { data } = await sb
        .from("ai_response_analysis")
        .select(
          "response_id, brand_mentioned, competitors_cited, mention_position"
        )
        .in("response_id", responseIds);
      analyses = data ?? [];
    }
    total_responses = analyses.length;
    brand_mentions_count = analyses.filter((a) => a.brand_mentioned).length;

    // ----- Agregation top 3 concurrents -----
    // On compte chaque competitor cite, en groupant par cle normalisee
    // (Stripe / stripe / stripe.com -> meme cle "stripe"). On garde la
    // premiere graphie rencontree comme nom canonique.
    const competitorAgg = new Map<
      string,
      { displayName: string; count: number }
    >();
    for (const a of analyses) {
      const cited = a.competitors_cited ?? [];
      for (const raw of cited) {
        if (!raw || typeof raw !== "string") continue;
        const key = normalizeCompetitorKey(raw);
        if (!key) continue;
        const existing = competitorAgg.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          competitorAgg.set(key, { displayName: raw.trim(), count: 1 });
        }
      }
    }
    top_competitors = [...competitorAgg.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((c) => ({
        name: c.displayName,
        mentions: c.count,
        pct_of_queries:
          total_queries > 0
            ? Math.round((c.count / (total_queries * 4)) * 100)
            : 0,
      }));

    // ----- Mentions de la marque (par REPONSE, base unifiee /120) -----
    // Avant la refonte localisation, on comptait par query unique
    // (Set<query_id>, max 30) — ce qui creait une asymetrie visuelle
    // sur le podium TopCompetitors (concurrent 18/120 vs Vous 10/30).
    // On unifie maintenant sur la meme base que les concurrents : nombre
    // de reponses (sur les 120 = 30 queries x 4 IA) ou la marque est
    // citee. Identique a brand_mentions_count.
    your_mentions_count = brand_mentions_count;

    // ----- Selection des apercus IA (Phase D.2 - bloc 5) -----
    // Strategie :
    //   1. Filtre : analyses ou la marque n'est PAS citee ET au moins
    //      un competitor du top 3 est cite (sinon aucun competitor cite
    //      du tout).
    //   2. Tri par : (a) query.category=comparative > service > branded,
    //      (b) provider=openai (ChatGPT) en priorite,
    //      (c) presence d'un competitor top 3 (priorite forte).
    //   3. On prend max 2 apercus, idealement 2 providers differents.
    //   4. Si rien trouve : on prend une reponse au hasard avec un
    //      competitor cite, ou une simple reponse ChatGPT.
    //   5. Si toutes les reponses contiennent la marque : on inverse,
    //      on montre 2 reponses ou la marque APPARAIT bien.
    const top3Keys = new Set(
      top_competitors.map((c) => normalizeCompetitorKey(c.name))
    );
    const allBrandMentioned =
      analyses.length > 0 && analyses.every((a) => a.brand_mentioned);

    const candidates = analyses
      .map((a) => {
        const resp = responsesById.get(a.response_id);
        if (!resp || !resp.raw_response) return null;
        const q = queriesById.get(resp.query_id);
        if (!q) return null;
        const competitorsCanonical = (a.competitors_cited ?? []).filter(
          (c) => typeof c === "string" && c.trim().length > 0
        );
        const hasTop3 = competitorsCanonical.some((c) =>
          top3Keys.has(normalizeCompetitorKey(c))
        );
        return {
          analysis: a,
          response: resp,
          query: q,
          competitors: competitorsCanonical,
          hasTop3,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const categoryRank: Record<QueryCategory, number> = {
      comparative: 0,
      service: 1,
      branded: 2,
    };
    const sortCandidates = (
      list: typeof candidates,
      preferTop3: boolean
    ): typeof candidates =>
      [...list].sort((x, y) => {
        if (preferTop3 && x.hasTop3 !== y.hasTop3) return x.hasTop3 ? -1 : 1;
        const cx = categoryRank[x.query.category];
        const cy = categoryRank[y.query.category];
        if (cx !== cy) return cx - cy;
        const px = x.response.provider === "openai" ? 0 : 1;
        const py = y.response.provider === "openai" ? 0 : 1;
        if (px !== py) return px - py;
        return x.query.position - y.query.position;
      });

    const pickSamples = (list: typeof candidates): typeof candidates => {
      const picked: typeof candidates = [];
      const seenProviders = new Set<AIProvider>();
      for (const c of list) {
        if (picked.length >= 2) break;
        // Diversifie les providers entre les 2 picks
        if (
          picked.length === 1 &&
          seenProviders.has(c.response.provider) &&
          // Si on n'a pas encore essaye, on cherche un provider different
          list.some((x) => !seenProviders.has(x.response.provider))
        ) {
          continue;
        }
        picked.push(c);
        seenProviders.add(c.response.provider);
      }
      return picked;
    };

    let chosen: typeof candidates = [];
    if (allBrandMentioned) {
      // Cas optimiste : toutes citent la marque -> on montre 2 reponses
      // ou la marque apparait (positionnement reverse de l'intention).
      const positives = candidates.filter((c) => c.analysis.brand_mentioned);
      chosen = pickSamples(sortCandidates(positives, false));
    } else {
      const negatives = candidates.filter((c) => !c.analysis.brand_mentioned);
      // 1ere passe : invisibles + competitor top 3 cite
      const withTop3 = negatives.filter((c) => c.hasTop3);
      const sorted = sortCandidates(
        withTop3.length > 0 ? withTop3 : negatives,
        true
      );
      chosen = pickSamples(sorted);
      // Filet de securite : si vraiment rien (pas d'analyses utilisables)
      if (chosen.length === 0) {
        chosen = pickSamples(sortCandidates(candidates, false));
      }
    }

    samples = chosen.map((c) => {
      const full = (c.response.raw_response ?? "").trim();
      // Tronque a 250 chars sans couper un mot, ajoute "..." si tronque.
      let preview = full;
      if (full.length > 250) {
        const slice = full.slice(0, 250);
        const lastSpace = slice.lastIndexOf(" ");
        preview =
          (lastSpace > 200 ? slice.slice(0, lastSpace) : slice).trimEnd() +
          "...";
      }
      return {
        id: c.response.id,
        provider: c.response.provider,
        provider_label: PROVIDER_LABELS[c.response.provider],
        provider_color: PROVIDER_COLORS[c.response.provider],
        query_text: c.query.text,
        query_category: c.query.category,
        response_preview: preview,
        response_full: full,
        brand_mentioned: c.analysis.brand_mentioned ?? false,
        competitors_cited: c.competitors,
      };
    });
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
    city: business?.city ?? null,
    city_main: business?.city_main ?? null,
    region: business?.region ?? null,
    country: business?.country ?? null,
    business_scope: ((business?.business_scope as
      | "local"
      | "national"
      | "international"
      | undefined) ?? "national"),

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
    top_competitors,
    your_mentions_count,
    samples,
    why_reasons,
    recommendations,
  };
}
