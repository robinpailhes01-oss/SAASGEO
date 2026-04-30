// =====================================================================
// Orchestrateur de l'audit technique Ankora.
//
// Pipeline :
//   1. Fetch la home (cascade fetch -> Jina -> Browserless)
//   2. Fetch en parallele : robots.txt, sitemap.xml, llms.txt, llms-full.txt
//   3. Sample des liens internes -> fetch de 5 pages echantillon
//   4. Pour chaque page sample : tente la version .md correspondante
//   5. Lance les 5 categories de checks
//   6. Calcule le score (skipped checks exclus du denominateur)
// =====================================================================

import type {
  CategoryResult,
  CheckResult,
  SampledPage,
  SiteData,
  TechAuditResult,
  TechCategory,
} from "./types";
import {
  fetchPage,
  fetchTextResource,
  isLikelySpa,
  type FetchResult,
} from "./fetcher";
import {
  loadHtml,
  extractMeta,
  extractInternalLinks,
  getOrigin,
  normalizeUrl,
  getDomain,
} from "./parser";

// Detection anti-bot : signaux explicites de pages de challenge
// (Vercel Security Checkpoint, Cloudflare, Akamai, etc.)
const ANTI_BOT_SIGNALS = [
  { pattern: /vercel security checkpoint/i, name: "Vercel Security Checkpoint" },
  { pattern: /just a moment\.{3}/i, name: "Cloudflare challenge" },
  { pattern: /cf-browser-verification/i, name: "Cloudflare browser verification" },
  { pattern: /attention required! \| cloudflare/i, name: "Cloudflare attention required" },
  { pattern: /access denied[\s\S]{0,200}akamai/i, name: "Akamai access denied" },
  { pattern: /please enable javascript and cookies to continue/i, name: "Generic JS challenge" },
];

function detectAntiBot(html: string, title: string): { blocked: boolean; signal?: string } {
  for (const s of ANTI_BOT_SIGNALS) {
    if (s.pattern.test(html) || s.pattern.test(title)) {
      return { blocked: true, signal: s.name };
    }
  }
  return { blocked: false };
}

import { runFoundations } from "./categories/foundations";
import { runGeoTriptych } from "./categories/geo-triptych";
import { runStructuredData } from "./categories/structured-data";
import { runContent } from "./categories/content";
import { runAuthority } from "./categories/authority";

const CATEGORY_LABELS: Record<TechCategory, string> = {
  foundations: "Fondations techniques",
  geo_triptych: "Triptyque GEO (llms.txt + .md + sitemap)",
  structured_data: "Donnees structurees (JSON-LD)",
  content: "Contenu optimise IA",
  authority: "Autorite externe (version lite)",
};

interface RunOptions {
  verbose?: boolean;
  // Nb de pages internes a sample (par defaut 5)
  sampleSize?: number;
}

export async function runTechAudit(
  url: string,
  opts: RunOptions = {}
): Promise<TechAuditResult> {
  const { verbose = true, sampleSize = 5 } = opts;
  const t0 = Date.now();

  const log = (msg: string) => {
    if (verbose) console.log(msg);
  };

  // Normalisation URL
  let urlNormalized: string;
  try {
    const u = new URL(url);
    urlNormalized = u.origin + u.pathname;
  } catch {
    throw new Error(`URL invalide : ${url}`);
  }

  log(`\n[audit] Cible : ${urlNormalized}`);
  log(`[audit] Lancement etape 1/5 — fetch de la home`);

  // ---------------------------------------------------------------
  // 1. Fetch home
  // ---------------------------------------------------------------
  const homeFetch = await fetchPage(urlNormalized, { verbose });

  if (!homeFetch.ok && homeFetch.status === 0) {
    throw new Error(
      `Impossible de fetch la home : ${homeFetch.error ?? "erreur reseau"}`
    );
  }

  const protocol = urlNormalized.startsWith("https") ? "https" : "http";
  const origin = getOrigin(urlNormalized);

  log(`[audit] etape 2/5 — fetch robots.txt + sitemap.xml + llms.txt + llms-full.txt`);

  // ---------------------------------------------------------------
  // 2. Fetch ressources annexes en parallele
  // ---------------------------------------------------------------
  const [robotsRes, sitemapRes, llmsRes, llmsFullRes] = await Promise.all([
    fetchTextResource(`${origin}/robots.txt`, { verbose }),
    fetchTextResource(`${origin}/sitemap.xml`, { verbose }),
    fetchTextResource(`${origin}/llms.txt`, { verbose }),
    fetchTextResource(`${origin}/llms-full.txt`, { verbose }),
  ]);

  log(`[audit] etape 3/5 — sampling des liens internes (${sampleSize} pages)`);

  // ---------------------------------------------------------------
  // 3. Extraction des liens internes + sampling
  // ---------------------------------------------------------------
  const $home = loadHtml(homeFetch.html);
  const allLinks = extractInternalLinks($home, origin);
  // Filtre les non-pages (assets, anchors deja captures, etc.)
  const pageLinks = allLinks.filter(
    (l) =>
      !/\.(png|jpg|jpeg|gif|svg|ico|webp|css|js|json|pdf|xml|zip|mp4|webm|woff2?)$/i.test(
        l
      ) && l !== urlNormalized
  );

  // Heuristique : on prefere les pages qui ressemblent a "service / about / faq / contact"
  const priorityRegexes = [
    /\/(services?|prestations?|offres?)\//,
    /\/(a-propos|about|qui-sommes-nous)\b/,
    /\/(faq|questions?)\b/,
    /\/(contact)\b/,
    /\/(blog|news|actualit)/,
  ];
  const prioritized: string[] = [];
  for (const re of priorityRegexes) {
    const m = pageLinks.find((l) => re.test(l));
    if (m && !prioritized.includes(m)) prioritized.push(m);
  }
  // Complete avec d'autres pages si on n'a pas atteint sampleSize
  for (const l of pageLinks) {
    if (prioritized.length >= sampleSize) break;
    if (!prioritized.includes(l)) prioritized.push(l);
  }

  const samples = prioritized.slice(0, sampleSize);
  log(`[audit] sample : ${samples.length} pages selectionnees`);

  // ---------------------------------------------------------------
  // 4. Fetch des pages sample + tentative .md
  // ---------------------------------------------------------------
  const sampledPages: SampledPage[] = await Promise.all(
    samples.map(async (sUrl): Promise<SampledPage> => {
      // Pour le fetch des pages sample, on n'utilise PAS Jina (couteux et lent)
      // — le scraping basique suffit pour les checks de statut HTTP
      const pageRes: FetchResult = await fetchPage(sUrl, {
        verbose: false,
        allowJsRendering: false,
      });
      const md = await fetchTextResource(`${sUrl}.md`, { verbose: false });
      return {
        url: sUrl,
        status: pageRes.status,
        html: pageRes.ok ? pageRes.html : null,
        method: pageRes.method,
        md_status: md.status,
        md_content: md.content,
      };
    })
  );

  // ---------------------------------------------------------------
  // Assemblage du SiteData
  // ---------------------------------------------------------------
  const siteData: SiteData = {
    url,
    url_normalized: urlNormalized,
    fetched_at: new Date().toISOString(),
    home_html: homeFetch.html,
    home_status: homeFetch.status,
    home_method: homeFetch.method,
    home_headers: homeFetch.headers,
    robots_txt: robotsRes.content,
    robots_status: robotsRes.status,
    sitemap_xml: sitemapRes.content,
    sitemap_status: sitemapRes.status,
    sitemap_url: `${origin}/sitemap.xml`,
    llms_txt: llmsRes.content,
    llms_full_txt: llmsFullRes.content,
    sampled_pages: sampledPages,
    protocol,
    redirect_chain: homeFetch.redirect_chain,
  };

  // ---------------------------------------------------------------
  // 5. Lancement des 5 categories en parallele
  // ---------------------------------------------------------------
  log(`[audit] etape 4/5 — execution des 5 categories de checks`);

  const [
    foundationsChecks,
    geoChecks,
    schemaChecks,
    contentChecks,
    authorityChecks,
  ] = await Promise.all([
    runFoundations({ siteData }),
    runGeoTriptych({ siteData }),
    runStructuredData({ siteData }),
    runContent({ siteData }),
    runAuthority({ siteData }),
  ]);

  // ---------------------------------------------------------------
  // 6. Calcul des scores par categorie + global
  // ---------------------------------------------------------------
  log(`[audit] etape 5/5 — calcul des scores`);

  const buildCategory = (
    cat: TechCategory,
    checks: CheckResult[]
  ): CategoryResult => {
    // Skipped checks : exclus du denominateur (pas de penalite injuste)
    const counted = checks.filter((c) => c.status !== "skipped");
    const earned = counted.reduce((a, c) => a + c.points_earned, 0);
    const max = counted.reduce((a, c) => a + c.points_max, 0);
    // Renormalise sur 20 (le total declare par categorie)
    const score = max > 0 ? Math.round((earned / max) * 20) : 0;
    return {
      category: cat,
      label: CATEGORY_LABELS[cat],
      score,
      max_score: 20,
      checks,
    };
  };

  const categories: CategoryResult[] = [
    buildCategory("foundations", foundationsChecks),
    buildCategory("geo_triptych", geoChecks),
    buildCategory("structured_data", schemaChecks),
    buildCategory("content", contentChecks),
    buildCategory("authority", authorityChecks),
  ];

  const totalScore = categories.reduce((a, c) => a + c.score, 0);
  const duration = Date.now() - t0;

  // Detection langue : html lang attribut > meta og:locale > null
  const $h = loadHtml(homeFetch.html);
  const meta = extractMeta($h);
  const language = meta.lang ?? meta.og.locale ?? null;

  // Detection anti-bot : si le HTML ressemble a un challenge,
  // on le flag pour que le rapport l'indique explicitement.
  const titleMatch = homeFetch.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const homeTitle = titleMatch ? titleMatch[1].trim() : "";
  const antiBot = detectAntiBot(homeFetch.html, homeTitle);

  if (antiBot.blocked) {
    log(`[audit] ⚠ Page anti-bot detectee : ${antiBot.signal}. Score biaise — Browserless requis pour audit complet.`);
  }

  log(`[audit] termine en ${(duration / 1000).toFixed(1)}s — score ${totalScore}/100`);

  return {
    url,
    url_normalized: urlNormalized,
    domain: getDomain(url),
    fetched_at: siteData.fetched_at,
    duration_ms: duration,
    language,
    total_score: totalScore,
    categories,
    metadata: {
      fetch_methods_used: Array.from(
        new Set([homeFetch.method, ...sampledPages.map((p) => p.method)])
      ),
      sampled_pages_count: sampledPages.length,
      has_sitemap: !!sitemapRes.content,
      has_robots: !!robotsRes.content,
      has_llms_txt: !!llmsRes.content,
      is_spa: isLikelySpa(homeFetch.html),
      is_anti_bot_blocked: antiBot.blocked,
      anti_bot_signal: antiBot.signal,
    },
  };
}

export { normalizeUrl, getDomain };
