// =====================================================================
// Detection de mention de marque dans une reponse IA — 3 couches.
//
// Couche 1 : match exact (case-insensitive) sur brand_name + aliases
// Couche 2 : match fuzzy (Levenshtein <= seuil pour mots longs)
// Couche 3 : LLM verifier sur les cas ambigus (couches 1+2 ratees mais
//            le contexte semble pertinent — ex: "Yacht Harmonie" au
//            lieu de "Harmonie Yacht")
//
// Cout : couches 1 et 2 = 0€. Couche 3 ~0.001€ par cas analyse (Haiku).
// =====================================================================

import type { GenerateTextResult } from "../types";
import { generateText } from "../providers";
import { TASK_MODELS } from "../models";
import { trackApiCall } from "../cost-tracker";
import {
  buildMentionAnalysisPrompt,
  MentionAnalysisSchema,
  type MentionAnalysis,
} from "../prompts/analyze-mention";
import { modelToProvider } from "../models";

// ---------------------------------------------------------------------
// Couche 1 : match exact case-insensitive
// ---------------------------------------------------------------------
export function findExactMention(
  text: string,
  brand_name: string,
  brand_aliases: string[]
): { found: boolean; matched: string | null; index: number } {
  if (!text) return { found: false, matched: null, index: -1 };
  const candidates = [brand_name, ...brand_aliases].filter(
    (s) => s && s.length >= 3
  );
  const lower = text.toLowerCase();

  let bestIdx = Infinity;
  let bestMatch: string | null = null;
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase());
    if (idx >= 0 && idx < bestIdx) {
      bestIdx = idx;
      bestMatch = c;
    }
  }
  return bestMatch
    ? { found: true, matched: bestMatch, index: bestIdx }
    : { found: false, matched: null, index: -1 };
}

// ---------------------------------------------------------------------
// Couche 2 : fuzzy match (Levenshtein) sur les mots longs
// ---------------------------------------------------------------------

// Distance de Levenshtein entre 2 strings
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

// Tolere 1-2 fautes selon la longueur du candidat
function fuzzyThreshold(len: number): number {
  if (len < 5) return 0;
  if (len < 8) return 1;
  return 2;
}

export function findFuzzyMention(
  text: string,
  brand_name: string,
  brand_aliases: string[]
): { found: boolean; matched: string | null; original: string | null } {
  if (!text) return { found: false, matched: null, original: null };
  const candidates = [brand_name, ...brand_aliases].filter(
    (s) => s && s.length >= 5
  );
  // Decoupage en mots et bigrammes pour matcher les variantes
  const tokens = text.split(/[\s.,;:!?'"()[\]/\\-]+/).filter(Boolean);

  for (const candidate of candidates) {
    const candLen = candidate.length;
    const threshold = fuzzyThreshold(candLen);
    if (threshold === 0) continue;

    // Match sur mots simples
    for (const t of tokens) {
      if (Math.abs(t.length - candLen) > threshold) continue;
      if (levenshtein(t, candidate) <= threshold) {
        return { found: true, matched: candidate, original: t };
      }
    }
    // Match sur bigrammes (pour marques composees)
    if (candidate.includes(" ")) {
      for (let i = 0; i < tokens.length - 1; i++) {
        const bigram = `${tokens[i]} ${tokens[i + 1]}`;
        if (Math.abs(bigram.length - candLen) > threshold) continue;
        if (levenshtein(bigram, candidate) <= threshold) {
          return { found: true, matched: candidate, original: bigram };
        }
      }
    }
  }
  return { found: false, matched: null, original: null };
}

// ---------------------------------------------------------------------
// Couche 3 : LLM verifier (Haiku) sur les cas ambigus
// Utilise uniquement si :
//   - Couche 1 et 2 ont rate
//   - MAIS la reponse contient des mots-cles du secteur ET la marque
//     a un nom relativement generique (verification preventive)
// ---------------------------------------------------------------------

export interface LayerLlmAnalysisResult {
  analysis: MentionAnalysis;
  cost_eur: number;
  cost_usd: number;
}

// Analyse LLM complete d'une reponse — couvre detection mention,
// position, sentiment, concurrents, sources. Plus complet que la
// simple detection couche 1+2.
export async function analyzeWithLlm(args: {
  brand_name: string;
  brand_aliases: string[];
  query: string;
  ai_response: string;
  audit_id?: string | null;
}): Promise<LayerLlmAnalysisResult> {
  const { system, prompt } = buildMentionAnalysisPrompt({
    brand_name: args.brand_name,
    brand_aliases: args.brand_aliases,
    query: args.query,
    ai_response: args.ai_response,
  });

  const model = TASK_MODELS.mention_analysis;
  const result: GenerateTextResult = await generateText(model, {
    system,
    prompt,
    temperature: 0,
    jsonMode: true,
    maxTokens: 800,
  });

  // Parse + valide via Zod
  let parsed: MentionAnalysis;
  try {
    const json = JSON.parse(result.text);
    parsed = MentionAnalysisSchema.parse(json);
  } catch (e) {
    // Fallback : si le LLM a mal formate, on retourne un objet vide
    console.warn(
      `[brand-mention] LLM analysis parse failed : ${e instanceof Error ? e.message : String(e)}`
    );
    parsed = {
      brand_mentioned: false,
      mention_position: null,
      mention_context: null,
      brand_citation_present: false,
      sentiment: null,
      competitors_cited: [],
      sources_cited: [],
    };
  }

  // Track le cost dans api_usage
  await trackApiCall({
    user_id: null,
    audit_id: args.audit_id ?? null,
    provider: modelToProvider(model),
    model,
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
    request_type: "mention_analysis",
    actual_cost_usd: result.cost_usd,
  });

  return { analysis: parsed, cost_eur: result.cost_eur, cost_usd: result.cost_usd };
}

// ---------------------------------------------------------------------
// Pipeline complet : essaye couche 1 -> 2 -> 3
// Pour chaque reponse IA, on utilise systematiquement la couche 3 (LLM)
// car on veut aussi extraire sentiment + concurrents + sources, pas
// juste la mention. Les couches 1+2 servent de cross-check pour
// detecter les hallucinations LLM.
// ---------------------------------------------------------------------

export interface FullMentionResult {
  brand_mentioned: boolean;
  mention_position: number | null;
  mention_context: string | null;
  brand_citation_present: boolean;
  sentiment: "positive" | "neutral" | "negative" | null;
  competitors_cited: string[];
  sources_cited: string[];
  // Methode qui a detecte la mention (debug/qualite)
  detection_method: "exact" | "fuzzy" | "llm" | "none";
  // Cout LLM (0 si la couche 1+2 ont suffi, mais on appelle le LLM
  // de toute facon pour le sentiment + concurrents — cf. note ci-dessus)
  llm_cost_eur: number;
}

export async function detectMentionFull(args: {
  brand_name: string;
  brand_aliases: string[];
  query: string;
  ai_response: string;
  audit_id?: string | null;
}): Promise<FullMentionResult> {
  // Couches 1 et 2 (rapide, gratuit, deterministe)
  const exact = findExactMention(
    args.ai_response,
    args.brand_name,
    args.brand_aliases
  );
  const fuzzy = exact.found
    ? null
    : findFuzzyMention(args.ai_response, args.brand_name, args.brand_aliases);

  // Couche 3 LLM : detection complete + sentiment + concurrents + sources
  const llm = await analyzeWithLlm(args);

  // Cross-check : si couche 1+2 disent OUI mais LLM dit NON, on garde le
  // signal LLM (trust the model on context) mais on log l'incoherence.
  // Si couche 1+2 disent NON mais LLM dit OUI, on garde aussi le LLM
  // (peut detecter mention paraphrasee).
  const layered_says_yes = exact.found || (fuzzy?.found ?? false);
  if (layered_says_yes !== llm.analysis.brand_mentioned) {
    console.warn(
      `[brand-mention] Incoherence : couches 1+2=${layered_says_yes}, LLM=${llm.analysis.brand_mentioned}`
    );
  }

  // Methode finale : la plus restrictive qui a confirme
  let detection_method: FullMentionResult["detection_method"] = "none";
  if (llm.analysis.brand_mentioned) {
    if (exact.found) detection_method = "exact";
    else if (fuzzy?.found) detection_method = "fuzzy";
    else detection_method = "llm";
  }

  return {
    brand_mentioned: llm.analysis.brand_mentioned,
    mention_position: llm.analysis.mention_position,
    mention_context: llm.analysis.mention_context,
    brand_citation_present: llm.analysis.brand_citation_present,
    sentiment: llm.analysis.sentiment,
    competitors_cited: llm.analysis.competitors_cited,
    sources_cited: llm.analysis.sources_cited,
    detection_method,
    llm_cost_eur: llm.cost_eur,
  };
}
