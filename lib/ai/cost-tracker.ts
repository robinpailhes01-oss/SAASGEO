// =====================================================================
// Cost tracker : log chaque appel LLM dans api_usage Supabase.
// Source de verite pour le cap budget mensuel.
// =====================================================================

import { createAdminClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { AIProvider, RequestType } from "./types";
import { computeCostUsd, getPricing, usdToEur } from "./pricing";

type ApiUsageInsert = Database["public"]["Tables"]["api_usage"]["Insert"];

export interface TrackedCall {
  user_id: string | null;        // null si test ou pre-auth
  audit_id: string | null;        // null si non lie a un audit
  provider: AIProvider;
  model: string;
  tokens_in: number;
  tokens_out: number;
  request_type: RequestType;
  // Cout USD reel facture par le provider (OpenRouter renvoie
  // usage.cost dans la reponse). Si fourni, on utilise cette valeur
  // comme source de verite. Si null/undefined, on calcule depuis la
  // table pricing locale.
  actual_cost_usd?: number;
}

// Insert une ligne dans api_usage et retourne le cost calcule.
// Utilise le client admin (service_role) pour bypass RLS.
export async function trackApiCall(call: TrackedCall): Promise<{
  cost_usd: number;
  cost_eur: number;
}> {
  // Source de verite : cost reel du provider si dispo, sinon calcul local
  let cost_usd: number;
  if (typeof call.actual_cost_usd === "number" && call.actual_cost_usd > 0) {
    cost_usd = call.actual_cost_usd;
  } else {
    const pricing = getPricing(call.provider, call.model);
    if (!pricing) {
      console.warn(
        `[cost-tracker] Modele inconnu ${call.provider}/${call.model} et pas de actual_cost_usd — cost=0`
      );
      cost_usd = 0;
    } else {
      cost_usd = computeCostUsd(pricing, call.tokens_in, call.tokens_out);
    }
  }
  const cost_eur = usdToEur(cost_usd);

  const sb = createAdminClient();
  const row: ApiUsageInsert = {
    user_id: call.user_id,
    audit_id: call.audit_id,
    provider: call.provider,
    model: call.model,
    tokens_in: call.tokens_in,
    tokens_out: call.tokens_out,
    cost_usd,
    cost_eur,
    request_type: call.request_type,
  };
  const { error } = await sb.from("api_usage").insert(row);

  if (error) {
    // On ne fail pas l'audit si le tracking foire — on log et on continue
    console.error(`[cost-tracker] Erreur insert api_usage :`, error.message);
  }

  return { cost_usd, cost_eur };
}
