// =====================================================================
// Rate limiting par IP — anti-spam audits publics
//
// Brief Bloc 5 : max 3 audits/heure/IP.
//
// On s'appuie sur la fonction PG `check_rate_limit(p_ip, p_action,
// p_max, p_window_minutes)` livree en Phase A.1, qui retourne `true`
// quand la limite est ATTEINTE (count >= max). Cette fonction ne fait
// que la lecture — l'insertion d'une ligne dans `rate_limits` est faite
// ici, cote TS, apres autorisation. Cela permet de centraliser la
// politique d'enregistrement (on n'enregistre que les tentatives
// reellement traitees, pas les rejets).
//
// La table rate_limits est protegee par RLS (service_role uniquement) :
// on doit utiliser createAdminClient pour les ecrits.
// =====================================================================

import { createAdminClient } from "@/lib/supabase/server";

// Nom d'action standard pour les soumissions d'audits publics depuis
// la landing. Utilise comme cle de fenetrage dans rate_limits.action.
export const ACTION_AUDIT_SUBMIT = "audit_submit";

// Defauts brief Bloc 5 : 3 audits / 60 minutes / IP
export const DEFAULT_MAX = 3;
export const DEFAULT_WINDOW_MINUTES = 60;

export type RateLimitDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "rate_limited" | "config_error";
      retryAfterSec: number;
      message: string;
    };

export type EnforceOptions = {
  ip: string;
  action?: string;
  max?: number;
  windowMinutes?: number;
  // Lie l'enregistrement a un audit deja cree (analytics / debug)
  auditId?: string | null;
};

// Verifie si l'IP a deja atteint la limite. Si non, enregistre la
// tentative dans rate_limits et autorise. Si oui, refuse avec un
// retryAfterSec base sur la fenetre.
//
// Toutes les erreurs DB sont remontees en `config_error` (fail-closed)
// pour eviter qu'un incident Supabase ouvre la vanne anti-spam.
export async function enforceRateLimit(
  opts: EnforceOptions
): Promise<RateLimitDecision> {
  const ip = opts.ip;
  const action = opts.action ?? ACTION_AUDIT_SUBMIT;
  const max = opts.max ?? DEFAULT_MAX;
  const windowMinutes = opts.windowMinutes ?? DEFAULT_WINDOW_MINUTES;

  if (!ip) {
    return {
      allowed: false,
      reason: "config_error",
      retryAfterSec: 60,
      message: "IP cliente indisponible.",
    };
  }

  const supabase = createAdminClient();

  // 1. Verification : la fonction renvoie true si la limite est atteinte
  const { data: limited, error: rpcError } = await supabase.rpc(
    "check_rate_limit",
    {
      p_ip: ip,
      p_action: action,
      p_max: max,
      p_window_minutes: windowMinutes,
    }
  );

  if (rpcError) {
    return {
      allowed: false,
      reason: "config_error",
      retryAfterSec: 60,
      message: "Impossible de verifier le quota anti-spam.",
    };
  }

  if (limited === true) {
    return {
      allowed: false,
      reason: "rate_limited",
      retryAfterSec: windowMinutes * 60,
      message: `Limite atteinte (${max} audits par ${windowMinutes} minutes). Reessayez plus tard.`,
    };
  }

  // 2. Enregistrement de la tentative (compteur pour la prochaine verif)
  const { error: insertError } = await supabase.from("rate_limits").insert({
    ip_address: ip,
    action,
    audit_id: opts.auditId ?? null,
  });

  if (insertError) {
    // Echec d'insertion : on reste fail-closed pour garder un compteur
    // fiable (sinon une panne d'ecriture ouvre la vanne anti-spam).
    return {
      allowed: false,
      reason: "config_error",
      retryAfterSec: 60,
      message: "Erreur d'enregistrement de la requete.",
    };
  }

  return { allowed: true };
}
