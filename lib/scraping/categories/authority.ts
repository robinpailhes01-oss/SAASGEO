// =====================================================================
// Categorie 5 : Autorite externe — version LITE (20 pts)
// Sans DataForSEO. Utilise Wikipedia API + recherches Jina (gratuit) +
// signaux JSON-LD + detection de liens sociaux.
// =====================================================================

import type { CheckResult, SiteData } from "../types";
import {
  loadHtml,
  extractMeta,
  extractJsonLd,
  flattenJsonLd,
  findSchemasByType,
} from "../parser";

const CAT = "authority" as const;

// ---------------------------------------------------------------------
// Helper : extraction du nom de marque depuis le HTML
// (heuristique, sera remplacee en Bloc 3 par extraction LLM)
// ---------------------------------------------------------------------
function extractBrandName(siteData: SiteData): string {
  const $ = loadHtml(siteData.home_html);
  const meta = extractMeta($);
  const blocks = extractJsonLd($);
  const flat = flattenJsonLd(blocks);

  // 1. Schema Organization.name
  const orgs = findSchemasByType(flat, [
    "Organization",
    "Hotel",
    "LocalBusiness",
    "Restaurant",
    "Resort",
    "LodgingBusiness",
  ]);
  for (const o of orgs) {
    if (typeof o.name === "string" && o.name.trim()) return o.name.trim();
  }

  // 2. og:site_name
  if (meta.og.site_name) return meta.og.site_name;

  // 3. <title> — premiere partie avant un separateur
  if (meta.title) {
    const sep = /\s*[|·•—-]\s*/.exec(meta.title);
    return sep ? meta.title.slice(0, sep.index).trim() : meta.title.trim();
  }

  // 4. Domain hostname capitalize
  try {
    const host = new URL(siteData.url).hostname.replace(/^www\./, "");
    return host
      .split(".")[0]
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------
// Helper : recherche Jina (s.jina.ai) — renvoie le markdown des resultats
// ---------------------------------------------------------------------
async function jinaSearch(query: string): Promise<string> {
  const url = `https://s.jina.ai/${encodeURIComponent(query)}`;
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0",
    Accept: "text/plain",
  };
  if (process.env.JINA_API_KEY) {
    headers["Authorization"] = `Bearer ${process.env.JINA_API_KEY}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return "";
    return await res.text();
  } catch {
    clearTimeout(timeout);
    return "";
  }
}

// ---------------------------------------------------------------------
// Helper : verification Wikipedia (API REST officielle, gratuite)
// ---------------------------------------------------------------------
async function checkWikipedia(
  brandName: string,
  lang: "fr" | "en" = "fr"
): Promise<{ exists: boolean; url?: string; extract?: string }> {
  if (!brandName) return { exists: false };
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(brandName)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Ankora Audit Bot" },
    });
    if (res.status === 404) return { exists: false };
    if (!res.ok) return { exists: false };
    const data = (await res.json()) as {
      type?: string;
      title?: string;
      content_urls?: { desktop?: { page?: string } };
      extract?: string;
    };
    if (data.type === "disambiguation") return { exists: false };
    if (!data.extract) return { exists: false };
    return {
      exists: true,
      url: data.content_urls?.desktop?.page,
      extract: data.extract,
    };
  } catch {
    return { exists: false };
  }
}

// ---------------------------------------------------------------------
// Helper : compte les mentions du nom de marque dans un markdown de resultats
// ---------------------------------------------------------------------
function countMentions(haystack: string, needle: string): number {
  if (!haystack || !needle) return 0;
  const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return (haystack.match(re) ?? []).length;
}

interface Ctx {
  siteData: SiteData;
}

export async function runAuthority(ctx: Ctx): Promise<CheckResult[]> {
  const { siteData } = ctx;
  const checks: CheckResult[] = [];

  const brand = extractBrandName(siteData);
  const $ = loadHtml(siteData.home_html);
  const blocks = extractJsonLd($);
  const flat = flattenJsonLd(blocks);

  // ---- 5.1 Wikipedia presence (4 pts) ----
  if (!brand) {
    checks.push({
      id: "auth_wikipedia",
      category: CAT,
      label: "Page Wikipedia presente",
      status: "skipped",
      points_earned: 0,
      points_max: 4,
      evidence: "Nom de marque introuvable depuis le HTML",
    });
  } else {
    const [wikiFr, wikiEn] = await Promise.all([
      checkWikipedia(brand, "fr"),
      checkWikipedia(brand, "en"),
    ]);
    const wikiPresent = wikiFr.exists || wikiEn.exists;
    let score = 0;
    if (wikiFr.exists && wikiEn.exists) score = 4;
    else if (wikiPresent) score = 3;

    checks.push({
      id: "auth_wikipedia",
      category: CAT,
      label: "Page Wikipedia presente (FR + EN)",
      status: score === 4 ? "pass" : score === 3 ? "warn" : "fail",
      points_earned: score,
      points_max: 4,
      evidence: wikiPresent
        ? `FR=${wikiFr.exists ? wikiFr.url : "non"}, EN=${wikiEn.exists ? wikiEn.url : "non"} (recherche : "${brand}")`
        : `Aucune page Wikipedia FR ou EN pour "${brand}"`,
      recommendation:
        score === 4
          ? undefined
          : "Une presence Wikipedia est un signal d'autorite tres fort pour les IA. Si le business a une notoriete suffisante, considerer la creation d'une page (ou son etoffement).",
    });
  }

  // ---- 5.2 Mentions presse FR (3 pts) ----
  if (!brand) {
    checks.push({
      id: "auth_press_mentions",
      category: CAT,
      label: "Mentions presse (medias FR de reference)",
      status: "skipped",
      points_earned: 0,
      points_max: 3,
      evidence: "Nom de marque introuvable",
    });
  } else {
    // Recherche ciblee sur quelques medias FR de reference
    const pressQuery = `"${brand}" (site:lemonde.fr OR site:lefigaro.fr OR site:lesechos.fr OR site:lepoint.fr OR site:liberation.fr OR site:lefigaro.fr OR site:franceinfo.fr OR site:bfmtv.com)`;
    const results = await jinaSearch(pressQuery);
    const mentions = countMentions(results, brand);
    let score = 0;
    if (mentions >= 6) score = 3;
    else if (mentions >= 3) score = 2;
    else if (mentions >= 1) score = 1;

    checks.push({
      id: "auth_press_mentions",
      category: CAT,
      label: "Mentions presse (medias FR de reference)",
      status: score === 3 ? "pass" : score >= 1 ? "warn" : "fail",
      points_earned: score,
      points_max: 3,
      evidence: `${mentions} mention(s) detectee(s) dans la recherche presse FR`,
      recommendation:
        score === 3
          ? undefined
          : "Travailler les RP : viser au moins 3 mentions dans des medias FR reconnus (Le Monde, Le Figaro, Les Echos, Le Point, etc.) qui sont des sources d'autorite citees par les IA.",
    });
  }

  // ---- 5.3 AggregateRating >= 4.0 dans JSON-LD (2 pts) ----
  // Recupere la note la plus elevee detectee
  let bestRating: number | null = null;
  let ratingCount: number | null = null;
  for (const s of flat) {
    const ar =
      (s as Record<string, unknown>).aggregateRating ??
      (s["@type"] === "AggregateRating" ? s : null);
    if (
      ar &&
      typeof ar === "object" &&
      "ratingValue" in (ar as Record<string, unknown>)
    ) {
      const arObj = ar as Record<string, unknown>;
      const v = parseFloat(String(arObj.ratingValue));
      if (!isNaN(v) && (bestRating === null || v > bestRating)) {
        bestRating = v;
      }
      const c = parseInt(String(arObj.reviewCount ?? arObj.ratingCount ?? "0"));
      if (!isNaN(c) && c > 0) {
        ratingCount = (ratingCount ?? 0) + c;
      }
    }
  }
  let ratingScore = 0;
  let ratingStatus: "pass" | "warn" | "fail" = "fail";
  if (bestRating !== null) {
    if (bestRating >= 4.0) {
      ratingScore = 2;
      ratingStatus = "pass";
    } else if (bestRating >= 3.0) {
      ratingScore = 1;
      ratingStatus = "warn";
    }
  }
  checks.push({
    id: "auth_aggregate_rating",
    category: CAT,
    label: "AggregateRating >= 4.0 (avis structures)",
    status: bestRating === null ? "fail" : ratingStatus,
    points_earned: ratingScore,
    points_max: 2,
    evidence:
      bestRating !== null
        ? `Note ${bestRating}/5${ratingCount ? ` (${ratingCount} avis)` : ""}`
        : "Aucune AggregateRating detectee dans le JSON-LD",
    recommendation:
      ratingScore === 2
        ? undefined
        : bestRating === null
          ? "Ajouter une AggregateRating dans le JSON-LD si vous avez des avis verifies (ex: depuis Google Business, Tripadvisor)."
          : "La note est inferieure a 4.0/5 — travailler la qualite de service.",
  });

  // ---- 5.4 Mentions Reddit (2 pts) ----
  if (!brand) {
    checks.push({
      id: "auth_reddit",
      category: CAT,
      label: "Mentions Reddit (signaux organiques)",
      status: "skipped",
      points_earned: 0,
      points_max: 2,
      evidence: "Nom de marque introuvable",
    });
  } else {
    const redditQuery = `"${brand}" site:reddit.com`;
    const results = await jinaSearch(redditQuery);
    const mentions = countMentions(results, brand);
    let score = 0;
    if (mentions >= 4) score = 2;
    else if (mentions >= 1) score = 1;

    checks.push({
      id: "auth_reddit",
      category: CAT,
      label: "Mentions Reddit (signaux organiques)",
      status: score === 2 ? "pass" : score === 1 ? "warn" : "fail",
      points_earned: score,
      points_max: 2,
      evidence: `${mentions} mention(s) Reddit detectee(s)`,
      recommendation:
        score === 2
          ? undefined
          : "Reddit est tres cite par Perplexity et ChatGPT. Encourager les retours clients organiques sur Reddit (sans astroturfing) et participer aux conversations sectorielles.",
    });
  }

  // ---- 5.5 Profils sociaux lies depuis la home (2 pts) ----
  const socialPatterns = [
    { name: "Instagram", regex: /instagram\.com\/[a-zA-Z0-9._]+/ },
    { name: "LinkedIn", regex: /linkedin\.com\/(company|in)\/[a-zA-Z0-9-]+/ },
    { name: "Facebook", regex: /facebook\.com\/[a-zA-Z0-9.]+/ },
    { name: "X/Twitter", regex: /(twitter|x)\.com\/[a-zA-Z0-9_]+/ },
    { name: "YouTube", regex: /youtube\.com\/(c|channel|@)\/?[a-zA-Z0-9_-]+/ },
  ];
  const detected = socialPatterns.filter((s) => s.regex.test(siteData.home_html));
  let socialScore = 0;
  if (detected.length >= 3) socialScore = 2;
  else if (detected.length >= 1) socialScore = 1;
  checks.push({
    id: "auth_social_profiles",
    category: CAT,
    label: "Profils sociaux lies depuis la home (>=3)",
    status: socialScore === 2 ? "pass" : socialScore === 1 ? "warn" : "fail",
    points_earned: socialScore,
    points_max: 2,
    evidence:
      detected.length > 0
        ? `Detectes : ${detected.map((d) => d.name).join(", ")}`
        : "Aucun profil social lie",
    recommendation:
      socialScore === 2
        ? undefined
        : "Lier les profils sociaux principaux (Instagram, LinkedIn, Facebook) depuis le footer ou header du site.",
  });

  // ---- 5.6 Trustpilot / Tripadvisor presence (3 pts) ----
  if (!brand) {
    checks.push({
      id: "auth_review_platforms",
      category: CAT,
      label: "Presence Trustpilot / Tripadvisor / Booking",
      status: "skipped",
      points_earned: 0,
      points_max: 3,
      evidence: "Nom de marque introuvable",
    });
  } else {
    const reviewQuery = `"${brand}" (site:trustpilot.com OR site:tripadvisor.fr OR site:tripadvisor.com OR site:booking.com OR site:google.com/maps)`;
    const results = await jinaSearch(reviewQuery);
    const mentions = countMentions(results, brand);
    let score = 0;
    if (mentions >= 4) score = 3;
    else if (mentions >= 2) score = 2;
    else if (mentions >= 1) score = 1;

    checks.push({
      id: "auth_review_platforms",
      category: CAT,
      label: "Presence Trustpilot / Tripadvisor / Booking",
      status: score === 3 ? "pass" : score >= 1 ? "warn" : "fail",
      points_earned: score,
      points_max: 3,
      evidence: `${mentions} mention(s) sur les plateformes d'avis`,
      recommendation:
        score === 3
          ? undefined
          : "Creer/optimiser les profils sur les plateformes d'avis (Trustpilot, Tripadvisor pour tourisme, Google Business). Ces plateformes sont des sources frequemment citees par les IA.",
    });
  }

  // ---- 5.7 Google Business / Maps embed heuristique (2 pts) ----
  const html = siteData.home_html;
  const hasMapsEmbed =
    /google\.com\/maps\/embed/.test(html) ||
    /maps\.google\.com\/maps/.test(html);
  const hasMapsLink = /maps\.google\.com|goo\.gl\/maps|maps\.app\.goo\.gl/.test(
    html
  );
  let gbScore = 0;
  if (hasMapsEmbed) gbScore = 2;
  else if (hasMapsLink) gbScore = 1;

  checks.push({
    id: "auth_google_business",
    category: CAT,
    label: "Reference Google Business / Maps depuis la home",
    status: gbScore === 2 ? "pass" : gbScore === 1 ? "warn" : "fail",
    points_earned: gbScore,
    points_max: 2,
    evidence: hasMapsEmbed
      ? "Embed Google Maps detecte sur la home"
      : hasMapsLink
        ? "Lien vers Google Maps mais pas d'embed"
        : "Aucune reference Google Maps depuis la home",
    recommendation:
      gbScore === 2
        ? undefined
        : "Integrer un embed Google Maps sur la page contact + creer/optimiser le profil Google Business (signal local fort).",
  });

  // ---- 5.8 Mentions plateformes sectorielles tourisme (2 pts) ----
  if (!brand) {
    checks.push({
      id: "auth_sectoral",
      category: CAT,
      label: "Mentions plateformes sectorielles (luxe, tourisme)",
      status: "skipped",
      points_earned: 0,
      points_max: 2,
      evidence: "Nom de marque introuvable",
    });
  } else {
    const sectoralQuery = `"${brand}" (site:relaischateaux.com OR site:tablethotels.com OR site:mrandmrssmith.com OR site:smallluxuryhotels.com OR site:leadinghotelsoftheworld.com OR site:condenasttraveler.com OR site:travelandleisure.com)`;
    const results = await jinaSearch(sectoralQuery);
    const mentions = countMentions(results, brand);
    let score = 0;
    if (mentions >= 3) score = 2;
    else if (mentions >= 1) score = 1;

    checks.push({
      id: "auth_sectoral",
      category: CAT,
      label: "Mentions plateformes sectorielles (luxe, tourisme)",
      status: score === 2 ? "pass" : score === 1 ? "warn" : "fail",
      points_earned: score,
      points_max: 2,
      evidence: `${mentions} mention(s) sur les plateformes de luxe / tourisme reconnues`,
      recommendation:
        score === 2
          ? undefined
          : "Approcher les plateformes sectorielles de prestige (Relais & Chateaux, Tablet Hotels, Mr & Mrs Smith, Leading Hotels of the World, Conde Nast Traveler) — sources d'autorite tres citees par les IA pour le tourisme haut de gamme.",
    });
  }

  return checks;
}
