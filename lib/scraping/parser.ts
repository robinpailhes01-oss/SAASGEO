// =====================================================================
// Module parser : utilitaires Cheerio pour extraire les signaux
// du HTML utiles aux 5 categories d'audit.
// =====================================================================

import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";

export type Cheerio = CheerioAPI;

export function loadHtml(html: string): Cheerio {
  return cheerio.load(html);
}

// ---------------------------------------------------------------------
// JSON-LD extraction
// ---------------------------------------------------------------------

export interface JsonLdBlock {
  raw: string;
  parsed: unknown;
  parseError?: string;
}

export function extractJsonLd($: Cheerio): JsonLdBlock[] {
  const blocks: JsonLdBlock[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text();
    if (!raw.trim()) return;
    try {
      blocks.push({ raw, parsed: JSON.parse(raw) });
    } catch (e) {
      blocks.push({
        raw,
        parsed: null,
        parseError: e instanceof Error ? e.message : String(e),
      });
    }
  });
  return blocks;
}

// Aplatit les @graph et arrays imbriques pour faciliter la recherche
export function flattenJsonLd(blocks: JsonLdBlock[]): Record<string, unknown>[] {
  const flat: Record<string, unknown>[] = [];
  for (const b of blocks) {
    if (!b.parsed) continue;
    const entries = Array.isArray(b.parsed) ? b.parsed : [b.parsed];
    for (const e of entries) {
      if (typeof e !== "object" || e === null) continue;
      const obj = e as Record<string, unknown>;
      if (Array.isArray(obj["@graph"])) {
        for (const g of obj["@graph"] as unknown[]) {
          if (typeof g === "object" && g !== null)
            flat.push(g as Record<string, unknown>);
        }
      } else {
        flat.push(obj);
      }
    }
  }
  return flat;
}

// Trouve les schemas dont @type matche (insensible a la casse, gere les arrays)
export function findSchemasByType(
  flat: Record<string, unknown>[],
  types: string[]
): Record<string, unknown>[] {
  const lowerTypes = types.map((t) => t.toLowerCase());
  return flat.filter((s) => {
    const t = s["@type"];
    if (!t) return false;
    const arr = Array.isArray(t) ? t : [t];
    return arr.some(
      (x) => typeof x === "string" && lowerTypes.includes(x.toLowerCase())
    );
  });
}

// ---------------------------------------------------------------------
// Hierarchie HTML
// ---------------------------------------------------------------------

export interface HeadingInfo {
  h1: string[];
  h2: string[];
  h3: string[];
  h4: string[];
}

export function extractHeadings($: Cheerio): HeadingInfo {
  const get = (sel: string) =>
    $(sel)
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);
  return {
    h1: get("h1"),
    h2: get("h2"),
    h3: get("h3"),
    h4: get("h4"),
  };
}

// Detecte les questions completes dans une liste de strings
// (utile pour la "densite conversationnelle")
const QUESTION_REGEX =
  /\b(qui|que|quoi|quand|comment|pourquoi|combien|ou|est-ce|peut-on|peut-il|peut-elle|what|how|why|when|where|who|which|can|do|does|is|are)\b/i;

export function isQuestion(text: string): boolean {
  if (!text) return false;
  const t = text.trim();
  if (t.endsWith("?")) return true;
  // Question implicite : commence par un mot interrogatif ET fait > 20 chars
  return QUESTION_REGEX.test(t) && t.length > 20;
}

// ---------------------------------------------------------------------
// Meta tags
// ---------------------------------------------------------------------

export interface MetaInfo {
  title: string | null;
  description: string | null;
  canonical: string | null;
  viewport: string | null;
  lang: string | null;
  hreflang: { lang: string; href: string }[];
  og: Record<string, string>;
  twitter: Record<string, string>;
}

export function extractMeta($: Cheerio): MetaInfo {
  const og: Record<string, string> = {};
  const twitter: Record<string, string> = {};
  const hreflang: { lang: string; href: string }[] = [];

  $('meta[property^="og:"]').each((_, el) => {
    const k = $(el).attr("property")?.replace("og:", "");
    const v = $(el).attr("content");
    if (k && v) og[k] = v;
  });

  $('meta[name^="twitter:"]').each((_, el) => {
    const k = $(el).attr("name")?.replace("twitter:", "");
    const v = $(el).attr("content");
    if (k && v) twitter[k] = v;
  });

  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const lang = $(el).attr("hreflang");
    const href = $(el).attr("href");
    if (lang && href) hreflang.push({ lang, href });
  });

  return {
    title: $("head > title").first().text().trim() || null,
    description:
      $('meta[name="description"]').first().attr("content")?.trim() ?? null,
    canonical: $('link[rel="canonical"]').first().attr("href") ?? null,
    viewport: $('meta[name="viewport"]').first().attr("content") ?? null,
    lang: $("html").attr("lang") ?? null,
    hreflang,
    og,
    twitter,
  };
}

// ---------------------------------------------------------------------
// Liens et images
// ---------------------------------------------------------------------

export function extractInternalLinks($: Cheerio, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const links = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const u = new URL(href, baseUrl);
      if (u.host === base.host) {
        // Normalise : retire les fragments et trailing slash
        u.hash = "";
        links.add(u.toString().replace(/\/$/, ""));
      }
    } catch {
      // ignore href invalides (mailto:, tel:, javascript:)
    }
  });
  return Array.from(links);
}

export function extractImageStats($: Cheerio): {
  total: number;
  withAlt: number;
  withMeaningfulAlt: number; // alt non vide et > 3 chars
} {
  let total = 0;
  let withAlt = 0;
  let withMeaningfulAlt = 0;
  $("img").each((_, el) => {
    total += 1;
    const alt = $(el).attr("alt");
    if (alt !== undefined) {
      withAlt += 1;
      if (alt.trim().length > 3) withMeaningfulAlt += 1;
    }
  });
  return { total, withAlt, withMeaningfulAlt };
}

// ---------------------------------------------------------------------
// Body text utilities
// ---------------------------------------------------------------------

// Compte de mots du texte visible (hors script/style/nav)
export function countVisibleWords($: Cheerio): number {
  const $clone = cheerio.load($.html());
  $clone("script, style, nav, header, footer, noscript").remove();
  const text = $clone("body").text().replace(/\s+/g, " ").trim();
  return text.split(/\s+/).filter(Boolean).length;
}

// Extrait le texte visible complet pour analyses LLM ou heuristiques
export function extractVisibleText($: Cheerio): string {
  const $clone = cheerio.load($.html());
  $clone("script, style, noscript, svg").remove();
  return $clone("body").text().replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------
// Robots.txt parsing
// ---------------------------------------------------------------------

export interface RobotsRules {
  // Pour chaque user-agent, liste des Allow et Disallow
  userAgents: Record<string, { allow: string[]; disallow: string[] }>;
  sitemaps: string[];
}

export function parseRobotsTxt(content: string): RobotsRules {
  const userAgents: Record<string, { allow: string[]; disallow: string[] }> = {};
  const sitemaps: string[] = [];

  let currentAgents: string[] = [];
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.split("#")[0].trim();
    if (!line) {
      // Ligne vide : reset des agents si on en avait
      currentAgents = [];
      continue;
    }
    const sepIdx = line.indexOf(":");
    if (sepIdx < 0) continue;
    const key = line.slice(0, sepIdx).trim().toLowerCase();
    const value = line.slice(sepIdx + 1).trim();

    if (key === "user-agent") {
      if (currentAgents.length === 0) {
        currentAgents = [value];
      } else {
        // Plusieurs UA consecutifs → on les groupe
        currentAgents.push(value);
      }
      if (!userAgents[value]) userAgents[value] = { allow: [], disallow: [] };
    } else if (key === "allow") {
      for (const a of currentAgents) {
        if (!userAgents[a]) userAgents[a] = { allow: [], disallow: [] };
        userAgents[a].allow.push(value);
      }
    } else if (key === "disallow") {
      for (const a of currentAgents) {
        if (!userAgents[a]) userAgents[a] = { allow: [], disallow: [] };
        userAgents[a].disallow.push(value);
      }
    } else if (key === "sitemap") {
      sitemaps.push(value);
    }
  }

  return { userAgents, sitemaps };
}

// Verifie si un bot specifique est autorise a crawler /
// Logique : si la regle pour ce bot OU * autorise / et ne disallow pas /
export function isBotAllowed(rules: RobotsRules, botName: string): boolean {
  const bot = rules.userAgents[botName];
  const wildcard = rules.userAgents["*"];

  // Cas 1 : disallow explicite pour ce bot → bloque
  if (bot) {
    const disallowsAll = bot.disallow.some((d) => d === "/" || d === "");
    if (disallowsAll) {
      // Mais l'allow plus specifique peut surclasser
      const explicitAllow = bot.allow.some((a) => a === "/" || a === "");
      return explicitAllow;
    }
    // Pas de disallow / → autorise
    return true;
  }

  // Cas 2 : pas de regle specifique → fallback sur *
  if (wildcard) {
    const wcDisallowsAll = wildcard.disallow.some(
      (d) => d === "/" || d === ""
    );
    if (wcDisallowsAll) {
      const wcAllow = wildcard.allow.some((a) => a === "/" || a === "");
      return wcAllow;
    }
    return true;
  }

  // Cas 3 : pas de robots.txt explicite → autorise par defaut
  return true;
}

// ---------------------------------------------------------------------
// Sitemap XML parsing
// ---------------------------------------------------------------------

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
}

export interface SitemapInfo {
  isIndex: boolean;
  entries: SitemapEntry[];
  childSitemaps: string[];
  parseError?: string;
}

export function parseSitemap(xml: string): SitemapInfo {
  const result: SitemapInfo = {
    isIndex: false,
    entries: [],
    childSitemaps: [],
  };
  if (!xml || !xml.includes("<")) {
    result.parseError = "XML vide ou non valide";
    return result;
  }

  // Index sitemap (sitemapindex)
  if (/<sitemapindex/i.test(xml)) {
    result.isIndex = true;
    const matches = xml.matchAll(/<sitemap>[\s\S]*?<loc>([\s\S]*?)<\/loc>/gi);
    for (const m of matches) {
      result.childSitemaps.push(m[1].trim());
    }
    return result;
  }

  // Urlset standard
  const urlMatches = xml.matchAll(/<url>([\s\S]*?)<\/url>/gi);
  for (const m of urlMatches) {
    const block = m[1];
    const locMatch = block.match(/<loc>([\s\S]*?)<\/loc>/i);
    const lastmodMatch = block.match(/<lastmod>([\s\S]*?)<\/lastmod>/i);
    if (locMatch) {
      result.entries.push({
        loc: locMatch[1].trim(),
        lastmod: lastmodMatch ? lastmodMatch[1].trim() : undefined,
      });
    }
  }

  if (result.entries.length === 0 && result.childSitemaps.length === 0) {
    result.parseError = "Aucune URL ou enfant detecte";
  }

  return result;
}

// ---------------------------------------------------------------------
// URL utilities
// ---------------------------------------------------------------------

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    // Pas de trailing slash sauf pour la racine
    let s = u.toString();
    if (s.endsWith("/") && u.pathname.length > 1) s = s.slice(0, -1);
    return s;
  } catch {
    return url;
  }
}

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}
