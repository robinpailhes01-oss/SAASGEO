// =====================================================================
// Module fetcher : recupere le HTML d'une page selon une cascade
//   1. fetch direct (le plus rapide, gratuit)
//   2. Jina Reader (r.jina.ai) si fetch echoue ou contenu vide (SPA)
//   3. Browserless (rendu JS complet) si Jina insuffisant
//
// Logue chaque tentative pour debugging.
// =====================================================================

import { marked } from "marked";
import type { FetchMethod } from "./types";

// User-Agent realiste pour eviter les blocages basiques anti-bot
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

const FETCH_TIMEOUT_MS = 12_000;
const JINA_TIMEOUT_MS = 25_000;
const BROWSERLESS_TIMEOUT_MS = 30_000;

export interface FetchResult {
  ok: boolean;
  status: number;
  html: string;
  method: FetchMethod;
  redirect_chain: string[];
  headers: Record<string, string>;
  error?: string;
}

// Heuristique : detecte si le HTML est probablement un SPA non rendu
// (peu de texte body, beaucoup de scripts, signaux Next/React)
export function isLikelySpa(html: string): boolean {
  if (!html) return true;
  const lower = html.toLowerCase();

  // Markers explicites de SPA
  const hasNextData = lower.includes("__next_data__");
  const hasRootEmpty = /<div id="root"\s*>\s*<\/div>/i.test(html);
  const hasAppEmpty = /<div id="__nuxt"\s*>\s*<\/div>/i.test(html);

  // Ratio texte / HTML : un site rendu cote serveur a beaucoup de texte
  const textOnly = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .trim();
  const meaningfulText = textOnly.length;

  return hasNextData || hasRootEmpty || hasAppEmpty || meaningfulText < 500;
}

// Etape 1 : fetch direct
async function tryDirectFetch(url: string): Promise<FetchResult> {
  const redirect_chain: string[] = [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // Reconstitue la chaine de redirects (Node fetch ne l'expose pas
    // directement — on capture juste l'url finale + l'url initiale si differentes)
    if (res.url && res.url !== url) {
      redirect_chain.push(url, res.url);
    } else {
      redirect_chain.push(url);
    }

    const html = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });

    return {
      ok: res.ok,
      status: res.status,
      html,
      method: "fetch",
      redirect_chain,
      headers,
    };
  } catch (e) {
    clearTimeout(timeout);
    return {
      ok: false,
      status: 0,
      html: "",
      method: "fetch",
      redirect_chain: [url],
      headers: {},
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// Etape 2 : Jina Reader (gratuit, public)
// Endpoint : https://r.jina.ai/{encodedUrl} → renvoie une version markdown
// rendue cote serveur (utilise Headless Chrome chez Jina).
async function tryJinaReader(url: string): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), JINA_TIMEOUT_MS);

  try {
    // On utilise le mode markdown par defaut de Jina :
    // c'est le seul mode gratuit qui retourne du contenu RENDU (incluant SPA).
    // On convertit ensuite le markdown en HTML pour que Cheerio puisse parser.
    const jinaUrl = `https://r.jina.ai/${url}`;
    const headers: Record<string, string> = {
      "User-Agent": UA,
      Accept: "text/plain, text/markdown",
    };
    // Si JINA_API_KEY presente : on l'utilise pour rate limit etendu et
    // pour eventuellement activer X-Engine: browser (HTML rendu direct)
    if (process.env.JINA_API_KEY) {
      headers["Authorization"] = `Bearer ${process.env.JINA_API_KEY}`;
      headers["X-Engine"] = "browser";
      headers["X-Return-Format"] = "html";
    }

    const res = await fetch(jinaUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    let html = await res.text();
    const respHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      respHeaders[k.toLowerCase()] = v;
    });

    // Si on est en mode markdown (sans JINA_API_KEY) → conversion en HTML
    // pour que le reste du pipeline (Cheerio) fonctionne uniformement.
    const looksLikeMarkdown =
      !html.trimStart().startsWith("<") &&
      (html.startsWith("Title:") || html.includes("Markdown Content:"));

    if (looksLikeMarkdown) {
      // Jina retourne un format type "Title: ...\nURL Source: ...\nMarkdown Content:\n..."
      // On extrait le titre + le contenu markdown puis on convertit.
      const titleMatch = html.match(/^Title:\s*(.+)$/m);
      const contentMatch = html.match(/Markdown Content:\s*\n([\s\S]+)$/);
      const title = titleMatch ? titleMatch[1].trim() : "";
      const md = contentMatch ? contentMatch[1] : html;
      const renderedBody = marked.parse(md, { async: false }) as string;
      html = `<!DOCTYPE html><html lang="fr"><head><title>${title}</title></head><body>${renderedBody}</body></html>`;
    }

    return {
      ok: res.ok,
      status: res.status,
      html,
      method: "jina",
      redirect_chain: [url],
      headers: respHeaders,
    };
  } catch (e) {
    clearTimeout(timeout);
    return {
      ok: false,
      status: 0,
      html: "",
      method: "jina",
      redirect_chain: [url],
      headers: {},
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// Etape 3 : Browserless (rendu JS complet, payant — fallback final)
// Necessite BROWSERLESS_TOKEN dans .env. Si absent : erreur explicite.
async function tryBrowserless(url: string): Promise<FetchResult> {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) {
    return {
      ok: false,
      status: 0,
      html: "",
      method: "browserless",
      redirect_chain: [url],
      headers: {},
      error:
        "Browserless token manquant — active le fallback ou skip JS rendering. Configure BROWSERLESS_TOKEN dans .env.local pour activer cette etape.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BROWSERLESS_TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://production-sfo.browserless.io/content?token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          gotoOptions: { waitUntil: "networkidle2", timeout: 25_000 },
          userAgent: UA,
        }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    const html = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });

    return {
      ok: res.ok,
      status: res.status,
      html,
      method: "browserless",
      redirect_chain: [url],
      headers,
    };
  } catch (e) {
    clearTimeout(timeout);
    return {
      ok: false,
      status: 0,
      html: "",
      method: "browserless",
      redirect_chain: [url],
      headers: {},
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// Merge le <head> du direct fetch (qui contient meta tags + JSON-LD) avec
// le <body> rendu via Jina (markdown converti en HTML).
// Critique pour les SPA : la home statique contient les bonnes meta mais
// un body vide ; Jina nous donne le body rendu.
function mergeHeadBody(directHtml: string, renderedHtml: string): string {
  const headMatch = directHtml.match(/<head[\s\S]*?<\/head>/i);
  const bodyMatch = renderedHtml.match(/<body[\s\S]*?<\/body>/i);
  // Garde aussi le <html lang="..."> du direct si present
  const htmlOpenMatch = directHtml.match(/<html[^>]*>/i);

  const htmlOpen = htmlOpenMatch ? htmlOpenMatch[0] : "<html>";
  const head = headMatch ? headMatch[0] : "<head></head>";
  const body = bodyMatch ? bodyMatch[0] : "<body></body>";

  return `<!DOCTYPE html>${htmlOpen}${head}${body}</html>`;
}

// Cascade complete avec logging clair de chaque tentative.
// Retourne le premier succes utile, ou le dernier echec.
export async function fetchPage(
  url: string,
  options: { allowJsRendering?: boolean; verbose?: boolean } = {}
): Promise<FetchResult> {
  const { allowJsRendering = true, verbose = true } = options;
  const log = (msg: string) => {
    if (verbose) console.log(`  [fetcher] ${msg}`);
  };

  log(`tentative 1/3 — fetch direct : ${url}`);
  const direct = await tryDirectFetch(url);

  if (direct.ok && !isLikelySpa(direct.html)) {
    log(`✓ fetch direct OK (${direct.html.length} chars, contenu rendu cote serveur)`);
    return direct;
  }
  if (!direct.ok) {
    log(`✗ fetch direct echec : ${direct.status} ${direct.error ?? ""}`);
  } else {
    log(`! fetch direct OK mais probable SPA — on garde le <head> et on tente Jina pour le <body>`);
  }

  if (!allowJsRendering) {
    log(`! allowJsRendering=false, on retourne le fetch direct`);
    return direct;
  }

  log(`tentative 2/3 — Jina Reader : r.jina.ai`);
  const jina = await tryJinaReader(url);

  // Cas SPA : on merge head (direct) + body (jina rendu)
  if (jina.ok && jina.html.length > 500 && direct.ok) {
    const merged = mergeHeadBody(direct.html, jina.html);
    log(
      `✓ Jina OK + merge head/body (final ${merged.length} chars : head direct + body Jina rendu)`
    );
    return {
      ok: true,
      status: direct.status,
      html: merged,
      method: "jina",
      redirect_chain: direct.redirect_chain,
      headers: { ...direct.headers, ...jina.headers },
    };
  }

  // Cas direct fail mais Jina ok : on prend Jina seul (head sera limite)
  if (jina.ok && jina.html.length > 500) {
    log(`✓ Jina OK seul (${jina.html.length} chars)`);
    return jina;
  }
  log(`✗ Jina echec : ${jina.status} ${jina.error ?? ""}`);

  log(`tentative 3/3 — Browserless`);
  const bl = await tryBrowserless(url);
  if (bl.ok) {
    log(`✓ Browserless OK (${bl.html.length} chars)`);
    return bl;
  }
  log(`✗ Browserless : ${bl.error}`);

  // Aucune methode n'a fonctionne — on retourne le moins pire
  if (direct.ok) return direct;
  if (jina.ok) return jina;
  return bl;
}

// Fetch d'une ressource texte simple (robots.txt, sitemap.xml, llms.txt)
// Pas de cascade — soit le fichier existe et est servi en plain, soit il
// n'existe pas. Si ECONNREFUSED ou 404 → on retourne null contenu.
export async function fetchTextResource(
  url: string,
  options: { verbose?: boolean } = {}
): Promise<{ status: number | null; content: string | null }> {
  const { verbose = true } = options;
  const log = (msg: string) => {
    if (verbose) console.log(`  [fetcher] ${msg}`);
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": UA, Accept: "text/plain, text/xml, */*" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (res.status === 404 || res.status === 410) {
      log(`✗ ${url} → ${res.status}`);
      return { status: res.status, content: null };
    }
    const text = await res.text();
    log(`✓ ${url} → ${res.status} (${text.length} chars)`);
    return { status: res.status, content: text };
  } catch (e) {
    clearTimeout(timeout);
    log(
      `✗ ${url} → erreur reseau : ${e instanceof Error ? e.message : String(e)}`
    );
    return { status: null, content: null };
  }
}

// HEAD request pour verifier un statut HTTP sans charger le body
export async function headCheck(
  url: string
): Promise<{ status: number | null; ok: boolean }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": UA },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    return { status: res.status, ok: res.ok };
  } catch {
    clearTimeout(timeout);
    return { status: null, ok: false };
  }
}
