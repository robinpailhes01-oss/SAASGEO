// =====================================================================
// Categorie 2 : Triptyque GEO (20 pts)
// llms.txt + versions .md des pages + qualite globale du sitemap.
// =====================================================================

import type { CheckResult, SiteData } from "../types";
import { parseSitemap, extractMeta, loadHtml } from "../parser";

const CAT = "geo_triptych" as const;

interface Ctx {
  siteData: SiteData;
}

export async function runGeoTriptych(ctx: Ctx): Promise<CheckResult[]> {
  const { siteData } = ctx;
  const checks: CheckResult[] = [];

  // ---- 2.1 llms.txt present (4 pts) ----
  const hasLlms = !!siteData.llms_txt;
  checks.push({
    id: "llms_txt_present",
    category: CAT,
    label: "llms.txt present a la racine",
    status: hasLlms ? "pass" : "fail",
    points_earned: hasLlms ? 4 : 0,
    points_max: 4,
    evidence: hasLlms
      ? `${siteData.llms_txt!.length} chars`
      : "404 / non trouve",
    recommendation: hasLlms
      ? undefined
      : "Creer un fichier llms.txt a la racine du site selon la spec llmstxt.org. Format : Markdown avec H1 du site, bloc de description, puis sections de liens organises par categorie.",
  });

  // ---- 2.2 llms.txt bien structure (3 pts) ----
  if (hasLlms && siteData.llms_txt) {
    const txt = siteData.llms_txt;
    const hasH1 = /^#\s+\w/m.test(txt);
    const hasBlockquote = /^>\s+\w/m.test(txt);
    const hasH2Sections = (txt.match(/^##\s+\w/gm) ?? []).length;
    const hasLinks = (txt.match(/\[.+?\]\(.+?\)/g) ?? []).length;

    let score = 0;
    const issues: string[] = [];
    if (hasH1) score += 1;
    else issues.push("manque H1 (titre du site)");
    if (hasBlockquote) score += 0.5;
    else issues.push("manque bloc descriptif (>) sous le H1");
    if (hasH2Sections >= 1) score += 0.5;
    else issues.push("manque sections H2 (##)");
    if (hasLinks >= 5) score += 1;
    else if (hasLinks >= 1) score += 0.5;
    else issues.push("aucun lien markdown detecte");

    score = Math.round(score);

    checks.push({
      id: "llms_txt_structure",
      category: CAT,
      label: "llms.txt bien structure (spec llmstxt.org)",
      status: score === 3 ? "pass" : score >= 1 ? "warn" : "fail",
      points_earned: score,
      points_max: 3,
      evidence: `H1=${hasH1}, blockquote=${hasBlockquote}, H2 sections=${hasH2Sections}, liens=${hasLinks}`,
      recommendation:
        score === 3
          ? undefined
          : `Ameliorer le llms.txt : ${issues.join(", ")}.`,
    });

    // ---- 2.3 llms.txt couvre les pages principales (2 pts) ----
    if (siteData.sitemap_xml) {
      const sm = parseSitemap(siteData.sitemap_xml);
      const sitemapUrls = sm.entries.map((e) => e.loc.replace(/\/$/, ""));
      const llmsLinks =
        Array.from(txt.matchAll(/\[.+?\]\((https?:\/\/[^)]+)\)/g))
          .map((m) => m[1].replace(/\/$/, ""));
      const overlap = llmsLinks.filter((l) =>
        sitemapUrls.some((s) => s === l || l.startsWith(s))
      ).length;
      const ratio = sitemapUrls.length > 0
        ? overlap / Math.min(sitemapUrls.length, 10)
        : 0;
      const pass = ratio >= 0.3 || llmsLinks.length >= 5;

      checks.push({
        id: "llms_txt_coverage",
        category: CAT,
        label: "llms.txt couvre les pages principales",
        status: pass ? "pass" : "warn",
        points_earned: pass ? 2 : llmsLinks.length >= 1 ? 1 : 0,
        points_max: 2,
        evidence: `${llmsLinks.length} liens dans llms.txt, ${overlap} matches avec sitemap`,
        recommendation: pass
          ? undefined
          : "Lister dans le llms.txt au moins 5 liens vers les pages principales du site (services, a propos, contact, FAQ).",
      });
    } else {
      checks.push({
        id: "llms_txt_coverage",
        category: CAT,
        label: "llms.txt couvre les pages principales",
        status: "skipped",
        points_earned: 0,
        points_max: 2,
        evidence: "Pas de sitemap pour cross-checker la couverture",
      });
    }
  } else {
    // Pas de llms.txt → checks dependants en fail
    checks.push({
      id: "llms_txt_structure",
      category: CAT,
      label: "llms.txt bien structure (spec llmstxt.org)",
      status: "fail",
      points_earned: 0,
      points_max: 3,
      evidence: "llms.txt absent",
    });
    checks.push({
      id: "llms_txt_coverage",
      category: CAT,
      label: "llms.txt couvre les pages principales",
      status: "fail",
      points_earned: 0,
      points_max: 2,
      evidence: "llms.txt absent",
    });
  }

  // ---- 2.4 llms-full.txt present (2 pts) ----
  const hasLlmsFull = !!siteData.llms_full_txt;
  checks.push({
    id: "llms_full_txt_present",
    category: CAT,
    label: "llms-full.txt present (version complete)",
    status: hasLlmsFull ? "pass" : "warn",
    points_earned: hasLlmsFull ? 2 : 0,
    points_max: 2,
    evidence: hasLlmsFull
      ? `${siteData.llms_full_txt!.length} chars`
      : "non trouve",
    recommendation: hasLlmsFull
      ? undefined
      : "Generer un llms-full.txt qui contient l'integralite du contenu textuel du site, pour aider les IA a indexer en profondeur.",
  });

  // ---- 2.5 Versions .md des pages cles accessibles (4 pts) ----
  // On regarde combien de pages echantillonnees ont une version .md
  const samplesWithMd = siteData.sampled_pages.filter(
    (s) => s.md_status === 200 && s.md_content
  );
  const samplesTested = siteData.sampled_pages.filter(
    (s) => s.md_status !== undefined
  );
  if (samplesTested.length === 0) {
    checks.push({
      id: "md_versions_pages",
      category: CAT,
      label: "Versions .md accessibles pour les pages principales",
      status: "skipped",
      points_earned: 0,
      points_max: 4,
      evidence: "Aucune page n'a ete testee pour version .md",
    });
  } else {
    const ratio = samplesWithMd.length / samplesTested.length;
    let score = 0;
    if (ratio >= 0.8) score = 4;
    else if (ratio >= 0.5) score = 3;
    else if (ratio >= 0.2) score = 2;
    else if (samplesWithMd.length >= 1) score = 1;

    checks.push({
      id: "md_versions_pages",
      category: CAT,
      label: "Versions .md accessibles pour les pages principales",
      status: score >= 3 ? "pass" : score >= 1 ? "warn" : "fail",
      points_earned: score,
      points_max: 4,
      evidence: `${samplesWithMd.length}/${samplesTested.length} pages ont une version .md accessible`,
      recommendation:
        score === 4
          ? undefined
          : "Generer une version .md de chaque page principale (ex: /services.md). Les IA preferent le markdown au HTML pour comprendre la structure.",
    });
  }

  // ---- 2.6 Sitemap structure logique (depth <= 3) (2 pts) ----
  if (siteData.sitemap_xml) {
    const sm = parseSitemap(siteData.sitemap_xml);
    const allUrls = sm.entries.map((e) => e.loc);
    if (allUrls.length === 0 && sm.childSitemaps.length === 0) {
      checks.push({
        id: "sitemap_logical_structure",
        category: CAT,
        label: "Sitemap structure logique (profondeur <= 3)",
        status: "fail",
        points_earned: 0,
        points_max: 2,
        evidence: "Sitemap vide",
      });
    } else {
      const depths = allUrls.map((u) => {
        try {
          const path = new URL(u).pathname;
          return path.split("/").filter(Boolean).length;
        } catch {
          return 0;
        }
      });
      const maxDepth = depths.length > 0 ? Math.max(...depths) : 0;
      const avgDepth =
        depths.length > 0 ? depths.reduce((a, b) => a + b, 0) / depths.length : 0;
      const pass = maxDepth <= 3 && avgDepth <= 2;
      const partial = maxDepth <= 4;

      checks.push({
        id: "sitemap_logical_structure",
        category: CAT,
        label: "Sitemap structure logique (profondeur <= 3)",
        status: pass ? "pass" : partial ? "warn" : "fail",
        points_earned: pass ? 2 : partial ? 1 : 0,
        points_max: 2,
        evidence: `Profondeur max=${maxDepth}, moyenne=${avgDepth.toFixed(1)} (${allUrls.length} URLs)`,
        recommendation: pass
          ? undefined
          : "Aplatir l'architecture du site : eviter les URLs de profondeur > 3. Reorganiser en categories de premier niveau plus claires.",
      });
    }
  } else {
    checks.push({
      id: "sitemap_logical_structure",
      category: CAT,
      label: "Sitemap structure logique (profondeur <= 3)",
      status: "fail",
      points_earned: 0,
      points_max: 2,
      evidence: "Pas de sitemap",
    });
  }

  // ---- 2.7 Pages prioritaires en haut du sitemap (1 pt) ----
  if (siteData.sitemap_xml) {
    const sm = parseSitemap(siteData.sitemap_xml);
    const top10 = sm.entries.slice(0, 10).map((e) => e.loc.toLowerCase());
    const priorityKeywords = [
      "/",
      "/about",
      "/a-propos",
      "/contact",
      "/services",
      "/faq",
      "/home",
      "/accueil",
    ];
    const hasPriorityEarly = top10.some((u) =>
      priorityKeywords.some((p) => {
        try {
          return new URL(u).pathname === p || new URL(u).pathname === p + "/";
        } catch {
          return false;
        }
      })
    );
    checks.push({
      id: "sitemap_priority_first",
      category: CAT,
      label: "Pages prioritaires en haut du sitemap",
      status: hasPriorityEarly ? "pass" : "warn",
      points_earned: hasPriorityEarly ? 1 : 0,
      points_max: 1,
      evidence: hasPriorityEarly
        ? "Au moins une page prioritaire (home, services, contact) dans le top 10 du sitemap"
        : "Aucune page prioritaire detectee dans les 10 premieres entries",
      recommendation: hasPriorityEarly
        ? undefined
        : "Mettre les pages-cles (home, services, contact, FAQ) en tete du sitemap pour signaler leur importance.",
    });
  } else {
    checks.push({
      id: "sitemap_priority_first",
      category: CAT,
      label: "Pages prioritaires en haut du sitemap",
      status: "fail",
      points_earned: 0,
      points_max: 1,
      evidence: "Pas de sitemap",
    });
  }

  // ---- 2.8 Sitemap segmente si > 100 URLs (1 pt) ----
  if (siteData.sitemap_xml) {
    const sm = parseSitemap(siteData.sitemap_xml);
    const totalUrls = sm.entries.length;
    if (totalUrls > 100) {
      // Devrait etre un sitemap index
      const ok = sm.isIndex || sm.childSitemaps.length > 0;
      checks.push({
        id: "sitemap_segmented",
        category: CAT,
        label: "Sitemap segmente en index si > 100 URLs",
        status: ok ? "pass" : "warn",
        points_earned: ok ? 1 : 0,
        points_max: 1,
        evidence: `${totalUrls} URLs, ${ok ? "segmente correctement" : "pas de segmentation"}`,
        recommendation: ok
          ? undefined
          : "Avec plus de 100 URLs, segmenter le sitemap en sitemap-index avec sitemaps enfants (par categorie ou par date).",
      });
    } else {
      // Pas applicable mais OK : on donne le point
      checks.push({
        id: "sitemap_segmented",
        category: CAT,
        label: "Sitemap segmente en index si > 100 URLs",
        status: "pass",
        points_earned: 1,
        points_max: 1,
        evidence: `${totalUrls} URLs (segmentation non requise)`,
      });
    }
  } else {
    checks.push({
      id: "sitemap_segmented",
      category: CAT,
      label: "Sitemap segmente en index si > 100 URLs",
      status: "fail",
      points_earned: 0,
      points_max: 1,
      evidence: "Pas de sitemap",
    });
  }

  // ---- 2.9 Hreflang si multilingue (1 pt) ----
  const $ = loadHtml(siteData.home_html);
  const meta = extractMeta($);
  // Detection multilingue : presence d'un selecteur de langue ou liens "/en/", "/fr/"
  const html = siteData.home_html.toLowerCase();
  const multilingualHints =
    /href=["']\/(en|fr|es|de|it)\//.test(html) ||
    /class=["'][^"']*(language|lang-switcher|locale)[^"']*["']/.test(html) ||
    meta.hreflang.length > 0;

  if (multilingualHints) {
    const hasHreflang = meta.hreflang.length >= 2;
    checks.push({
      id: "hreflang_multilingual",
      category: CAT,
      label: "Hreflang configure (site multilingue)",
      status: hasHreflang ? "pass" : "fail",
      points_earned: hasHreflang ? 1 : 0,
      points_max: 1,
      evidence: hasHreflang
        ? `${meta.hreflang.length} hreflang declares`
        : `Site detecte comme multilingue mais ${meta.hreflang.length} hreflang seulement`,
      recommendation: hasHreflang
        ? undefined
        : "Ajouter les balises <link rel=\"alternate\" hreflang=\"...\"> pour chaque version linguistique du site.",
    });
  } else {
    // Pas multilingue → check non applicable, on donne le point
    checks.push({
      id: "hreflang_multilingual",
      category: CAT,
      label: "Hreflang configure (site multilingue)",
      status: "pass",
      points_earned: 1,
      points_max: 1,
      evidence: "Site monolingue (hreflang non requis)",
    });
  }

  return checks;
}
