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
}

// Insert une ligne dans api_usage et retourne le cost calcule.
// Utilise le client admin (service_role) pour bypass RLS.
export async function trackApiCall(call: TrackedCall): Promise<{
  cost_usd: number;
  cost_eur: number;
}> {
  const pricing = getPricing(call.provider, call.model);
  if (!pricing) {
    // Modele inconnu : on log avec cost=0 mais on warn dans la console
    console.warn(
      `[cost-tracker] Modele inconnu ${call.provider}/${call.model} — cost=0`
    );
    const sb = createAdminClient();
    const row: ApiUsageInsert = {
      user_id: call.user_id,
      audit_id: call.audit_id,
      provider: call.provider,
      model: call.model,
      tokens_in: call.tokens_in,
      tokens_out: call.tokens_out,
      cost_usd: 0,
      cost_eur: 0,
      request_type: call.request_type,
    };
    await sb.from("api_usage").insert(row);
    return { cost_usd: 0, cost_eur: 0 };
  }

  const cost_usd = computeCostUsd(pricing, call.tokens_in, call.tokens_out);
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
