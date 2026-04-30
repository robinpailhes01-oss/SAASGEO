// =====================================================================
// Adapter OpenRouter — proxy unifie pour tous les modeles LLM.
//
// API : https://openrouter.ai/api/v1/chat/completions (compatible OpenAI)
// Doc : https://openrouter.ai/docs
//
// On utilise fetch() direct plutot que le SDK OpenAI (evite une
// dependance lourde, pleine flexibilite sur les headers OpenRouter).
//
// Couts : OpenRouter retourne usage.cost dans la reponse (USD reel
// facture, marge incluse). C'est notre source de verite pour le
// tracking — plus precis que la table pricing locale.
// =====================================================================

import type { GenerateTextOptions, GenerateTextResult } from "../types";
import { usdToEur } from "../pricing";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 60_000;

// Reponse OpenRouter (subset utile)
interface OpenRouterResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
      // Annotations Perplexity et autres providers a sources
      annotations?: Array<{
        type: string;
        url?: string;
        title?: string;
        url_citation?: { url: string; title?: string };
      }>;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    // Cout reel facture par OpenRouter (USD), inclut leur margin
    cost?: number;
  };
  // Citations Perplexity (parfois separees du body)
  citations?: string[];
}

// Strip les fences markdown ```json ... ``` autour d'un JSON.
// Aussi gere le cas ou il y a juste ``` ... ``` sans le "json".
function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  // Pattern : ```json ... ``` ou ``` ... ```
  const fenceMatch = trimmed.match(/^```(?:json|javascript|js)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}

export class OpenRouterError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
  }
}

// Appel OpenRouter via le format chat/completions standard.
// Renvoie un GenerateTextResult normalise.
export async function callOpenRouter(
  model: string,
  opts: GenerateTextOptions
): Promise<GenerateTextResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterError(
      "OPENROUTER_API_KEY manquant. Configure-la dans .env.local.",
      0
    );
  }

  const messages: Array<{ role: string; content: string }> = [];
  if (opts.system) {
    messages.push({ role: "system", content: opts.system });
  }
  messages.push({ role: "user", content: opts.prompt });

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature ?? 0.7,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.jsonMode) {
    body.response_format = { type: "json_object" };
  }
  // OpenRouter : on demande le cout reel dans la reponse
  body.usage = { include: true };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    // Headers OpenRouter optionnels mais recommandes (apparaissent
    // dans leur dashboard, et certains modeles Anthropic les exigent)
    "HTTP-Referer":
      process.env.OPENROUTER_HTTP_REFERER ?? "https://ankora.ai",
    "X-Title": process.env.OPENROUTER_X_TITLE ?? "Ankora",
  };

  const t0 = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      throw new OpenRouterError(
        `OpenRouter ${res.status} : ${errText.slice(0, 500)}`,
        res.status
      );
    }

    const data = (await res.json()) as OpenRouterResponse;
    const latency_ms = Date.now() - t0;

    if (!data.choices || data.choices.length === 0) {
      throw new OpenRouterError("Reponse OpenRouter sans choices", 500);
    }

    let text = data.choices[0].message.content ?? "";
    // Anthropic Sonnet/Haiku via OpenRouter wrappent parfois le JSON dans
    // un fence markdown ```json ... ``` meme avec response_format json_object.
    // On strip les fences pour faciliter le parsing aval.
    if (opts.jsonMode) {
      text = stripMarkdownFences(text);
    }
    const tokens_in = data.usage?.prompt_tokens ?? 0;
    const tokens_out = data.usage?.completion_tokens ?? 0;
    // Cout reel facture par OpenRouter (USD). Si absent, on retourne 0
    // et le cost-tracker fallbackera sur le calcul depuis la pricing table.
    const cost_usd = data.usage?.cost ?? 0;
    const cost_eur = usdToEur(cost_usd);

    // Extraction des sources (Perplexity-style)
    const sources: GenerateTextResult["sources"] = [];
    if (data.citations && Array.isArray(data.citations)) {
      for (const url of data.citations) {
        sources.push({ url });
      }
    }
    const annotations = data.choices[0].message.annotations;
    if (annotations) {
      for (const a of annotations) {
        if (a.url_citation) {
          sources.push({
            url: a.url_citation.url,
            title: a.url_citation.title,
          });
        } else if (a.url) {
          sources.push({ url: a.url, title: a.title });
        }
      }
    }

    return {
      text,
      tokens_in,
      tokens_out,
      cost_usd,
      cost_eur,
      latency_ms,
      model,
      sources: sources.length > 0 ? sources : undefined,
      raw: data,
    };
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof OpenRouterError) throw e;
    throw new OpenRouterError(
      `Erreur reseau OpenRouter : ${e instanceof Error ? e.message : String(e)}`,
      0
    );
  }
}
