// =====================================================================
// Categorie 1 : Fondations techniques (20 pts)
// =====================================================================

import type { CheckResult, SiteData } from "../types";
import { headCheck } from "../fetcher";
import {
  parseRobotsTxt,
  parseSitemap,
  isBotAllowed,
  loadHtml,
  extractMeta,
} from "../parser";

const CAT = "foundations" as const;

interface Ctx {
  siteData: SiteData;
}

export async function runFoundations(ctx: Ctx): Promise<CheckResult[]> {
  const { siteData } = ctx;
  const checks: CheckResult[] = [];

  // ---- 1.1 sitemap.xml accessible (3 pts) ----
  const hasSitemap =
    siteData.sitemap_status === 200 && !!siteData.sitemap_xml;
  checks.push({
    id: "sitemap_accessible",
    category: CAT,
    label: "Sitemap.xml accessible (HTTP 200)",
    status: hasSitemap ? "pass" : "fail",
    points_earned: hasSitemap ? 3 : 0,
    points_max: 3,
    evidence: hasSitemap
      ? `${siteData.sitemap_url} → 200 (${siteData.sitemap_xml?.length ?? 0} chars)`
      : `${siteData.sitemap_url} → ${siteData.sitemap_status ?? "no response"}`,
    recommendation: hasSitemap
      ? undefined
      : "Generer un sitemap.xml a la racine du site et le declarer dans robots.txt via 'Sitemap: https://...'",
  });

  // ---- 1.2 sitemap valide + URLs resolvables (2 pts) ----
  if (hasSitemap && siteData.sitemap_xml) {
    const sm = parseSitemap(siteData.sitemap_xml);
    let validityScore = 0;
    let evidence = "";
    let recommendation: string | undefined;

    if (sm.parseError) {
      evidence = `Parse error : ${sm.parseError}`;
      recommendation = "Verifier que le sitemap est un XML valide conforme au protocole sitemaps.org";
    } else if (sm.isIndex && sm.childSitemaps.length > 0) {
      validityScore = 2;
      evidence = `Index sitemap avec ${sm.childSitemaps.length} sitemap(s) enfant(s)`;
    } else if (sm.entries.length > 0) {
      // Sample 3 URLs random pour HEAD check
      const sample = sampleArray(sm.entries.map((e) => e.loc), 3);
      const checkResults = await Promise.all(sample.map((u) => headCheck(u)));
      const okCount = checkResults.filter((r) => r.ok).length;
      if (okCount === sample.length) {
        validityScore = 2;
        evidence = `${sm.entries.length} URLs declarees, ${okCount}/${sample.length} sample 200 OK`;
      } else if (okCount >= sample.length - 1) {
        validityScore = 1;
        evidence = `${sm.entries.length} URLs, ${okCount}/${sample.length} sample valides`;
        recommendation = "Une URL du sample est en erreur — verifier que toutes les URLs declarees existent";
      } else {
        evidence = `${sm.entries.length} URLs, seulement ${okCount}/${sample.length} resolvables`;
        recommendation = "Plusieurs URLs du sitemap sont en erreur. Regenerer le sitemap depuis la source de verite des URLs";
      }
    } else {
      evidence = "Sitemap parse mais aucune URL detectee";
      recommendation = "Le sitemap est vide ou mal forme. Le regenerer.";
    }

    checks.push({
      id: "sitemap_valid_resolvable",
      category: CAT,
      label: "Sitemap valide + URLs resolvables (sample)",
      status: validityScore === 2 ? "pass" : validityScore === 1 ? "warn" : "fail",
      points_earned: validityScore,
      points_max: 2,
      evidence,
      recommendation,
    });

    // ---- 1.3 sitemap a jour (1 pt) ----
    const entriesWithLastmod = sm.entries.filter((e) => e.lastmod);
    if (entriesWithLastmod.length > 0) {
      const sixMonthsAgo = Date.now() - 6 * 30 * 24 * 3600 * 1000;
      const recent = entriesWithLastmod.filter((e) => {
        const t = e.lastmod ? Date.parse(e.lastmod) : NaN;
        return !isNaN(t) && t > sixMonthsAgo;
      });
      const ratio = recent.length / entriesWithLastmod.length;
      const pass = ratio > 0.5;
      checks.push({
        id: "sitemap_uptodate",
        category: CAT,
        label: "Sitemap a jour (>50% URLs avec lastmod < 6 mois)",
        status: pass ? "pass" : "warn",
        points_earned: pass ? 1 : 0,
        points_max: 1,
        evidence: `${recent.length}/${entriesWithLastmod.length} URLs avec lastmod recent (${Math.round(ratio * 100)}%)`,
        recommendation: pass
          ? undefined
          : "Le sitemap a peu de lastmod recents. Mettre a jour les dates lors des modifications de pages.",
      });
    } else {
      checks.push({
        id: "sitemap_uptodate",
        category: CAT,
        label: "Sitemap a jour (>50% URLs avec lastmod < 6 mois)",
        status: "warn",
        points_earned: 0,
        points_max: 1,
        evidence: "Aucune balise <lastmod> detectee dans le sitemap",
        recommendation: "Ajouter les balises <lastmod> aux entries du sitemap pour signaler les mises a jour aux IA et moteurs.",
      });
    }
  } else {
    // Pas de sitemap → 2 checks fail automatiquement
    checks.push({
      id: "sitemap_valid_resolvable",
      category: CAT,
      label: "Sitemap valide + URLs resolvables (sample)",
      status: "fail",
      points_earned: 0,
      points_max: 2,
      evidence: "Aucun sitemap accessible",
      recommendation: "Creer un sitemap.xml conforme au protocole sitemaps.org",
    });
    checks.push({
      id: "sitemap_uptodate",
      category: CAT,
      label: "Sitemap a jour",
      status: "fail",
      points_earned: 0,
      points_max: 1,
      evidence: "Aucun sitemap accessible",
    });
  }

  // ---- 1.4 robots.txt present (1 pt) ----
  const hasRobots = siteData.robots_status === 200 && !!siteData.robots_txt;
  checks.push({
    id: "robots_present",
    category: CAT,
    label: "robots.txt present a la racine",
    status: hasRobots ? "pass" : "fail",
    points_earned: hasRobots ? 1 : 0,
    points_max: 1,
    evidence: hasRobots
      ? `${siteData.robots_txt?.length ?? 0} chars`
      : `Status ${siteData.robots_status ?? "no response"}`,
    recommendation: hasRobots
      ? undefined
      : "Creer un robots.txt a la racine. Au minimum : 'User-agent: *\\nAllow: /\\nSitemap: https://...'",
  });

  // ---- 1.5 a 1.8 — bots IA autorises (4 x 1 pt) ----
  const robotsRules = siteData.robots_txt
    ? parseRobotsTxt(siteData.robots_txt)
    : { userAgents: {}, sitemaps: [] };

  const botsToCheck: { id: string; label: string; bots: string[] }[] = [
    {
      id: "robots_gptbot",
      label: "GPTBot autorise (OpenAI)",
      bots: ["GPTBot"],
    },
    {
      id: "robots_claudebot",
      label: "ClaudeBot / Claude-Web autorises (Anthropic)",
      bots: ["ClaudeBot", "Claude-Web", "anthropic-ai"],
    },
    {
      id: "robots_perplexitybot",
      label: "PerplexityBot autorise",
      bots: ["PerplexityBot", "Perplexity-User"],
    },
    {
      id: "robots_google_extended",
      label: "Google-Extended autorise",
      bots: ["Google-Extended"],
    },
  ];

  for (const { id, label, bots } of botsToCheck) {
    const allowed = bots.some((b) => isBotAllowed(robotsRules, b));
    // Si pas de robots → defaut autorise (mais on warn quand meme)
    if (!hasRobots) {
      checks.push({
        id,
        category: CAT,
        label,
        status: "warn",
        points_earned: 1,
        points_max: 1,
        evidence: "Pas de robots.txt → autorise par defaut, mais explicit > implicit",
        recommendation: `Ajouter une regle explicite 'User-agent: ${bots[0]}\\nAllow: /' pour signaler clairement l'autorisation.`,
      });
      continue;
    }
    const explicitMention = bots.some(
      (b) => robotsRules.userAgents[b] !== undefined
    );
    checks.push({
      id,
      category: CAT,
      label,
      status: allowed ? (explicitMention ? "pass" : "warn") : "fail",
      points_earned: allowed ? 1 : 0,
      points_max: 1,
      evidence: explicitMention
        ? `Regle explicite presente : ${bots.find((b) => robotsRules.userAgents[b]) ?? bots[0]}`
        : `Aucune regle explicite, fallback sur User-agent: *`,
      recommendation: allowed
        ? explicitMention
          ? undefined
          : `Ajouter une regle explicite pour ${bots[0]} pour signaler votre intention claire aux IA.`
        : `Le bot ${bots[0]} est actuellement bloque dans robots.txt. Ajouter 'User-agent: ${bots[0]}\\nAllow: /' si vous souhaitez etre indexe par cette IA.`,
    });
  }

  // ---- 1.9 HTTPS actif + certificat valide (2 pts) ----
  const isHttps = siteData.protocol === "https" && siteData.home_status === 200;
  checks.push({
    id: "https_active",
    category: CAT,
    label: "HTTPS actif avec certificat valide",
    status: isHttps ? "pass" : "fail",
    points_earned: isHttps ? 2 : 0,
    points_max: 2,
    evidence: `${siteData.protocol} — home status ${siteData.home_status}`,
    recommendation: isHttps
      ? undefined
      : "Activer HTTPS via Let's Encrypt ou le certificat SSL fourni par votre hebergeur.",
  });

  // ---- 1.10 Redirect HTTP → HTTPS (1 pt) ----
  // On test en faisant un fetch HTTP de la home et on regarde si on arrive en HTTPS
  if (isHttps) {
    const httpUrl = siteData.url.replace(/^https:\/\//, "http://");
    const httpCheck = await headCheck(httpUrl).catch(() => ({
      status: null,
      ok: false,
    }));
    // On considere que tout statut 2xx ou 3xx via fetch suit le redirect
    // (notre headCheck suit deja redirect: follow par defaut → si on arrive
    // en https final c'est que la redirection marche)
    const redirectsOK = httpCheck.ok;
    checks.push({
      id: "http_to_https_redirect",
      category: CAT,
      label: "Redirection HTTP → HTTPS",
      status: redirectsOK ? "pass" : "warn",
      points_earned: redirectsOK ? 1 : 0,
      points_max: 1,
      evidence: redirectsOK
        ? `HEAD ${httpUrl} → ${httpCheck.status} (suivi vers HTTPS)`
        : `HTTP non redirige proprement (status ${httpCheck.status ?? "no response"})`,
      recommendation: redirectsOK
        ? undefined
        : "Configurer une redirection 301 systematique de HTTP vers HTTPS dans le serveur web.",
    });
  } else {
    checks.push({
      id: "http_to_https_redirect",
      category: CAT,
      label: "Redirection HTTP → HTTPS",
      status: "fail",
      points_earned: 0,
      points_max: 1,
      evidence: "HTTPS pas actif, redirection non testee",
    });
  }

  // ---- 1.11 a 1.13 Core Web Vitals — SKIPPED si pas de PageSpeed API ----
  const hasPagespeedKey = !!process.env.PAGESPEED_API_KEY;
  const cwvChecks: { id: string; label: string; pts: number }[] = [
    { id: "cwv_lcp", label: "LCP < 2.5s (Largest Contentful Paint)", pts: 2 },
    { id: "cwv_cls", label: "CLS < 0.1 (Cumulative Layout Shift)", pts: 1 },
    { id: "cwv_inp", label: "INP < 200ms (Interaction to Next Paint)", pts: 1 },
  ];
  for (const c of cwvChecks) {
    checks.push({
      id: c.id,
      category: CAT,
      label: c.label,
      status: "skipped",
      points_earned: 0,
      points_max: c.pts,
      evidence: hasPagespeedKey
        ? "PageSpeed API configuree mais module non encore implemente"
        : "PAGESPEED_API_KEY manquant — verification non effectuee",
      recommendation: hasPagespeedKey
        ? undefined
        : "Configurer une cle Google PageSpeed Insights (gratuite) dans .env.local pour activer la verification Core Web Vitals.",
    });
  }

  // ---- 1.14 Mobile responsive (1 pt) ----
  const $ = loadHtml(siteData.home_html);
  const meta = extractMeta($);
  const hasViewport = !!meta.viewport && /width=/.test(meta.viewport);
  checks.push({
    id: "mobile_responsive",
    category: CAT,
    label: "Mobile responsive (viewport meta presente)",
    status: hasViewport ? "pass" : "fail",
    points_earned: hasViewport ? 1 : 0,
    points_max: 1,
    evidence: meta.viewport ?? "Aucune balise <meta name=\"viewport\"> detectee",
    recommendation: hasViewport
      ? undefined
      : "Ajouter '<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">' dans le <head>.",
  });

  // ---- 1.15 Pas d'erreurs 404/500 sur pages sample (1 pt) ----
  const samples = siteData.sampled_pages;
  if (samples.length === 0) {
    checks.push({
      id: "sample_pages_ok",
      category: CAT,
      label: "Pas d'erreurs 4xx/5xx sur pages echantillon",
      status: "skipped",
      points_earned: 0,
      points_max: 1,
      evidence: "Aucune page interne echantillonnee",
    });
  } else {
    const errors = samples.filter((s) => s.status >= 400);
    const allOk = errors.length === 0;
    checks.push({
      id: "sample_pages_ok",
      category: CAT,
      label: "Pas d'erreurs 4xx/5xx sur pages echantillon",
      status: allOk ? "pass" : "fail",
      points_earned: allOk ? 1 : 0,
      points_max: 1,
      evidence: allOk
        ? `${samples.length}/${samples.length} pages OK`
        : `${errors.length}/${samples.length} en erreur : ${errors.map((e) => `${e.url} (${e.status})`).join(", ")}`,
      recommendation: allOk
        ? undefined
        : "Reparer ou supprimer les liens internes vers des pages en erreur.",
    });
  }

  return checks;
}

// Tire un sample aleatoire d'un array
function sampleArray<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}
