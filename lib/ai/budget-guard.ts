// =====================================================================
// Budget guard : enforce le cap mensuel GLOBAL sur les 4 providers.
//
// Logique demandee par l'utilisateur :
//   - Cap CUMULATIF sur les 4 fournisseurs (somme totale, pas par provider)
//   - Refuse de lancer un audit si projection > cap (90€ par defaut)
//   - Email Resend a 70€ (warning) et 85€ (critique)
//   - Le cap est lu depuis MONTHLY_API_BUDGET_EUR avec fallback 90€
// =====================================================================

import { createAdminClient } from "@/lib/supabase/server";
import type { BudgetStatus } from "./types";

// Estimation cout d'un audit complet (calibree depuis Phase 0) :
//   - 1 brand extraction Haiku : ~0.0005€
//   - 1 queries gen Sonnet : ~0.01€
//   - 30 visibility queries x 4 providers : ~0.85€
//   - ~30 mention analysis Haiku : ~0.005€
//   - 1 synthesis Sonnet : ~0.05€
// Total ~0.92€. On prend 1.20€ pour avoir une marge de securite.
const ESTIMATED_AUDIT_COST_EUR = 1.2;

const DEFAULT_CAP_EUR = 90;
const DEFAULT_WARNING_EUR = 70;
const DEFAULT_CRITICAL_EUR = 85;

function getCaps() {
  return {
    cap_eur: parseFloat(process.env.MONTHLY_API_BUDGET_EUR ?? `${DEFAULT_CAP_EUR}`),
    warning_eur: parseFloat(
      process.env.BUDGET_WARNING_THRESHOLD_EUR ?? `${DEFAULT_WARNING_EUR}`
    ),
    critical_eur: parseFloat(
      process.env.BUDGET_CRITICAL_THRESHOLD_EUR ?? `${DEFAULT_CRITICAL_EUR}`
    ),
  };
}

// Recupere le total depense depuis le 1er du mois courant (timezone UTC).
// Lecture via le client admin (service_role) — donnee globale agregee
// sur tous les users (pour V0 single user, c'est le total Robin).
export async function getMonthToDateSpend(): Promise<number> {
  const sb = createAdminClient();
  const now = new Date();
  const firstOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  ).toISOString();

  const { data, error } = await sb
    .from("api_usage")
    .select("cost_eur")
    .gte("created_at", firstOfMonth);

  if (error) {
    console.error("[budget-guard] Erreur lecture api_usage :", error.message);
    // En cas d'erreur DB, on retourne 0 pour ne pas bloquer arbitrairement
    return 0;
  }

  return (data ?? []).reduce(
    (sum, row) => sum + Number(row.cost_eur ?? 0),
    0
  );
}

// Calcule le statut budget courant.
export async function getBudgetStatus(): Promise<BudgetStatus> {
  const { cap_eur, warning_eur, critical_eur } = getCaps();
  const current_total_eur = await getMonthToDateSpend();
  const remaining_eur = Math.max(0, cap_eur - current_total_eur);
  const projected_after_audit =
    current_total_eur + ESTIMATED_AUDIT_COST_EUR;

  let alert_level: BudgetStatus["alert_level"] = "ok";
  if (current_total_eur >= cap_eur) alert_level = "blocked";
  else if (current_total_eur >= critical_eur) alert_level = "critical";
  else if (current_total_eur >= warning_eur) alert_level = "warning";

  return {
    current_total_eur,
    cap_eur,
    remaining_eur,
    alert_level,
    estimated_audit_cost_eur: ESTIMATED_AUDIT_COST_EUR,
    can_run_audit: projected_after_audit <= cap_eur,
  };
}

// Erreur dediee pour les refus de budget — facilite le catch dans l'orchestrateur
export class BudgetExceededError extends Error {
  status: BudgetStatus;
  constructor(status: BudgetStatus, message?: string) {
    super(
      message ??
        `Budget mensuel atteint : ${status.current_total_eur.toFixed(2)}€ / ${status.cap_eur}€. Audit refuse.`
    );
    this.name = "BudgetExceededError";
    this.status = status;
  }
}

// A appeler AVANT de lancer un audit. Si projection depassee → throws.
export async function ensureBudgetAvailable(): Promise<BudgetStatus> {
  const status = await getBudgetStatus();
  if (!status.can_run_audit) {
    throw new BudgetExceededError(status);
  }
  return status;
}

// A appeler APRES chaque trackApiCall. Detecte les franchissements de seuils
// (70€ → warning, 85€ → critical) et envoie un email Resend si le seuil
// vient juste d'etre franchi (pour eviter les emails repetes).
//
// Logique de "vient juste d'etre franchi" :
//   total_avant < seuil ET total_apres >= seuil
// Le total_avant peut etre passe en argument (calcule par l'orchestrateur
// avant l'appel) pour eviter une 2eme requete DB.
export async function checkAndAlertThresholds(args: {
  total_before_eur: number;
  total_after_eur: number;
}): Promise<{ alertSent: "warning" | "critical" | null }> {
  const { warning_eur, critical_eur } = getCaps();
  const { total_before_eur, total_after_eur } = args;

  // Critical a priorite sur warning
  if (total_before_eur < critical_eur && total_after_eur >= critical_eur) {
    await sendBudgetAlert("critical", total_after_eur);
    return { alertSent: "critical" };
  }
  if (total_before_eur < warning_eur && total_after_eur >= warning_eur) {
    await sendBudgetAlert("warning", total_after_eur);
    return { alertSent: "warning" };
  }
  return { alertSent: null };
}

// Envoie un email Resend. Si RESEND_API_KEY absente, log warning et retourne.
async function sendBudgetAlert(
  level: "warning" | "critical",
  total_eur: number
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "alerts@ankora.ai";
  const to = process.env.ADMIN_EMAIL;
  const { cap_eur, warning_eur, critical_eur } = getCaps();

  if (!apiKey) {
    console.warn(
      `[budget-guard] RESEND_API_KEY manquant — alerte ${level} (${total_eur.toFixed(2)}€) NON envoyee par email.`
    );
    return;
  }
  if (!to) {
    console.warn(
      `[budget-guard] ADMIN_EMAIL manquant — alerte ${level} (${total_eur.toFixed(2)}€) NON envoyee.`
    );
    return;
  }

  const subject =
    level === "critical"
      ? `[Ankora] CRITIQUE — depense ${total_eur.toFixed(2)}€ / ${cap_eur}€`
      : `[Ankora] Avertissement budget — depense ${total_eur.toFixed(2)}€ / ${cap_eur}€`;

  const seuil = level === "critical" ? critical_eur : warning_eur;
  const html = `
    <h2>Alerte budget Ankora — ${level === "critical" ? "CRITIQUE" : "Avertissement"}</h2>
    <p>La depense cumulee API du mois en cours vient de franchir le seuil <strong>${seuil}€</strong>.</p>
    <ul>
      <li><strong>Total depense</strong> : ${total_eur.toFixed(2)}€</li>
      <li><strong>Cap mensuel</strong> : ${cap_eur}€</li>
      <li><strong>Restant</strong> : ${(cap_eur - total_eur).toFixed(2)}€</li>
    </ul>
    ${level === "critical"
      ? "<p><strong>A 5€ pres du cap dur — verifiez les usages avant de lancer de nouveaux audits.</strong></p>"
      : "<p>Continuez a surveiller — le critique est a 85€.</p>"}
    <p>Depense par provider et detail consultables dans l'admin Ankora.</p>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error(
        `[budget-guard] Resend API erreur ${res.status} : ${await res.text()}`
      );
    }
  } catch (e) {
    console.error("[budget-guard] Resend network error :", e);
  }
}

// Helper pour les tests : permet d'injecter un fake getMonthToDateSpend
// pour tester la logique de seuils sans toucher a la DB.
export const _internal = {
  getCaps,
  ESTIMATED_AUDIT_COST_EUR,
};
