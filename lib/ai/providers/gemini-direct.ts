// =====================================================================
// Adapter Gemini direct — fallback optionnel pour le free tier Google.
//
// Active uniquement si GEMINI_API_KEY est presente dans l'environnement.
// Utilise l'API Gemini officielle (generativelanguage.googleapis.com)
// au format Google natif — economie de la margin OpenRouter (~5-10%)
// + bypass du compteur OpenRouter pour les Gemini calls.
//
// Free tier Google (avril 2026) :
//   - gemini-2.5-flash : 15 req/min, 1500 req/jour
//   - largement suffisant pour 75 audits/mois (30 queries x 75 = 2250
//     queries/mois soit ~75/jour en moyenne)
// =====================================================================

import type { GenerateTextOptions, GenerateTextResult } from "../types";
import { computeCostUsd, getPricing, usdToEur } from "../pricing";

const DEFAULT_TIMEOUT_MS = 60_000;

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
      role?: string;
    };
    finishReason?: string;
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

export class GeminiDirectError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GeminiDirectError";
    this.status = status;
  }
}

// Helper : convertit un nom de modele OpenRouter ("google/gemini-2.5-flash")
// vers le nom natif Gemini ("gemini-2.5-flash")
function toGeminiNativeModel(openrouterModel: string): string {
  if (openrouterModel.startsWith("google/")) {
    return openrouterModel.slice("google/".length);
  }
  return openrouterModel;
}

export async function callGeminiDirect(
  openrouterModel: string,
  opts: GenerateTextOptions
): Promise<GenerateTextResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiDirectError(
      "GEMINI_API_KEY manquant. Cet adapter est optionnel — utilise OpenRouter pour les Gemini calls.",
      0
    );
  }

  const model = toGeminiNativeModel(openrouterModel);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Format Gemini natif : combine system + user dans contents
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  if (opts.system) {
    // Gemini accepte system_instruction au top-level, mais pour simplicite
    // on le merge avec le prompt user (compatible avec tous les modeles)
    contents.push({
      role: "user",
      parts: [{ text: `${opts.system}\n\n${opts.prompt}` }],
    });
  } else {
    contents.push({ role: "user", parts: [{ text: opts.prompt }] });
  }

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      ...(opts.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
      ...(opts.jsonMode ? { responseMimeType: "application/json" } : {}),
    },
  };

  const t0 = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      throw new GeminiDirectError(
        `Gemini ${res.status} : ${errText.slice(0, 500)}`,
        res.status
      );
    }

    const data = (await res.json()) as GeminiResponse;
    const latency_ms = Date.now() - t0;

    const candidate = data.candidates?.[0];
    let text =
      candidate?.content?.parts
        ?.map((p) => p.text ?? "")
        .filter(Boolean)
        .join("") ?? "";

    // Strip eventuels fences markdown si jsonMode (Gemini les met parfois)
    if (opts.jsonMode) {
      const trimmed = text.trim();
      const fenceMatch = trimmed.match(
        /^```(?:json|javascript|js)?\s*\n?([\s\S]*?)\n?```\s*$/
      );
      if (fenceMatch) text = fenceMatch[1].trim();
    }

    const tokens_in = data.usageMetadata?.promptTokenCount ?? 0;
    const tokens_out = data.usageMetadata?.candidatesTokenCount ?? 0;

    // Calcul cout depuis la table pricing locale (Gemini direct ne
    // facture pas dans la reponse). Le free tier rendra cost=0 dans
    // la realite, mais on track quand meme la valeur "equivalente"
    // pour comparer si on switchait a payant.
    const pricing = getPricing("gemini", model);
    const cost_usd = pricing
      ? computeCostUsd(pricing, tokens_in, tokens_out)
      : 0;
    const cost_eur = usdToEur(cost_usd);

    // Extraction des sources (grounding metadata si Gemini a fait
    // du Google Search grounding — non actif par defaut en V1)
    const sources: GenerateTextResult["sources"] = [];
    const groundingChunks = candidate?.groundingMetadata?.groundingChunks;
    if (groundingChunks) {
      for (const chunk of groundingChunks) {
        if (chunk.web?.uri) {
          sources.push({ url: chunk.web.uri, title: chunk.web.title });
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
      model: openrouterModel, // on garde le nom OpenRouter pour la coherence
      sources: sources.length > 0 ? sources : undefined,
      raw: data,
    };
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof GeminiDirectError) throw e;
    throw new GeminiDirectError(
      `Erreur reseau Gemini : ${e instanceof Error ? e.message : String(e)}`,
      0
    );
  }
}

export function isGeminiDirectAvailable(): boolean {
  return !!process.env.GEMINI_API_KEY;
}
