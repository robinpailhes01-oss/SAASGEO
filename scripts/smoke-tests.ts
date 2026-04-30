// =====================================================================
// Smoke tests — Bloc 3 : verifie que les 4 connexions API marchent
//
// Lance : pnpm tsx scripts/smoke-tests.ts
//
// Tests :
//   1. OpenRouter avec Claude Haiku 4.5 (1 token, ~0.0001€)
//   2. OpenRouter avec Gemini 2.5 Flash via OpenRouter
//   3. Gemini direct (free tier, 0€)
//   4. Resend : email test vers ADMIN_EMAIL
//
// A la fin : affiche le total cumule en api_usage Supabase pour verif.
// =====================================================================

import { readFileSync } from "node:fs";

// Charge .env.local
const envContent = readFileSync(".env.local", "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
  const eq = trimmed.indexOf("=");
  const k = trimmed.slice(0, eq).trim();
  const v = trimmed.slice(eq + 1).trim();
  if (!process.env[k]) process.env[k] = v;
}

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GRAY = "\x1b[90m";

function pass(msg: string) {
  console.log(`  ${GREEN}✓${RESET} ${msg}`);
}
function fail(msg: string) {
  console.log(`  ${RED}✗${RESET} ${msg}`);
}
function info(msg: string) {
  console.log(`  ${GRAY}└ ${msg}${RESET}`);
}

async function runTests() {
  console.log(`${BOLD}\n══════════════════════════════════════════════════════════════════════`);
  console.log(`  ANKORA — Smoke tests Bloc 3`);
  console.log(`══════════════════════════════════════════════════════════════════════${RESET}\n`);

  let totalCostUsd = 0;
  const results: { test: string; ok: boolean; cost_usd: number; details?: string }[] = [];

  // ---- Test 1 : OpenRouter Claude Haiku ----
  console.log(`${BOLD}1. OpenRouter / Claude Haiku 4.5${RESET}`);
  try {
    const { callOpenRouter } = await import("../lib/ai/providers/openrouter");
    const r = await callOpenRouter("anthropic/claude-haiku-4-5", {
      prompt: "Reponds par un seul mot : OK",
      maxTokens: 10,
      temperature: 0,
    });
    pass(`reponse : "${r.text.trim().slice(0, 50)}"`);
    info(`tokens : ${r.tokens_in} in / ${r.tokens_out} out`);
    info(`cost : $${r.cost_usd.toFixed(6)} = ${r.cost_eur.toFixed(6)}€`);
    info(`latency : ${r.latency_ms}ms`);
    totalCostUsd += r.cost_usd;
    results.push({ test: "OpenRouter Haiku", ok: true, cost_usd: r.cost_usd });

    // Track dans api_usage pour validation end-to-end
    const { trackApiCall } = await import("../lib/ai/cost-tracker");
    await trackApiCall({
      user_id: null,
      audit_id: null,
      provider: "anthropic",
      model: "anthropic/claude-haiku-4-5",
      tokens_in: r.tokens_in,
      tokens_out: r.tokens_out,
      request_type: "test",
      actual_cost_usd: r.cost_usd,
    });
    pass("trackApiCall dans api_usage : OK");
  } catch (e) {
    fail(`echec : ${e instanceof Error ? e.message : String(e)}`);
    results.push({
      test: "OpenRouter Haiku",
      ok: false,
      cost_usd: 0,
      details: e instanceof Error ? e.message : String(e),
    });
  }

  console.log();

  // ---- Test 2 : OpenRouter Gemini ----
  console.log(`${BOLD}2. OpenRouter / Gemini 2.5 Flash (via OpenRouter)${RESET}`);
  try {
    // On force l'utilisation d'OpenRouter en supprimant temporairement GEMINI_API_KEY
    const savedKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const { generateText } = await import("../lib/ai/providers/index");
    const r = await generateText("google/gemini-2.5-flash", {
      prompt: "Reponds par un seul mot : OK",
      maxTokens: 10,
      temperature: 0,
    });
    pass(`reponse : "${r.text.trim().slice(0, 50)}"`);
    info(`tokens : ${r.tokens_in} in / ${r.tokens_out} out`);
    info(`cost : $${r.cost_usd.toFixed(6)} = ${r.cost_eur.toFixed(6)}€`);
    info(`latency : ${r.latency_ms}ms`);
    totalCostUsd += r.cost_usd;
    results.push({ test: "OpenRouter Gemini", ok: true, cost_usd: r.cost_usd });

    process.env.GEMINI_API_KEY = savedKey;
  } catch (e) {
    fail(`echec : ${e instanceof Error ? e.message : String(e)}`);
    results.push({
      test: "OpenRouter Gemini",
      ok: false,
      cost_usd: 0,
      details: e instanceof Error ? e.message : String(e),
    });
  }

  console.log();

  // ---- Test 3 : Gemini direct ----
  console.log(`${BOLD}3. Gemini direct (free tier)${RESET}`);
  try {
    const { generateText } = await import("../lib/ai/providers/index");
    const r = await generateText("google/gemini-2.5-flash", {
      prompt: "Reponds par un seul mot : OK",
      maxTokens: 10,
      temperature: 0,
    });
    pass(`reponse : "${r.text.trim().slice(0, 50)}"`);
    info(`tokens : ${r.tokens_in} in / ${r.tokens_out} out`);
    info(`cost (estime, free tier reel = 0$) : $${r.cost_usd.toFixed(6)}`);
    info(`latency : ${r.latency_ms}ms`);
    info(`model retourne : ${r.model}`);
    results.push({ test: "Gemini direct", ok: true, cost_usd: r.cost_usd });
  } catch (e) {
    fail(`echec : ${e instanceof Error ? e.message : String(e)}`);
    results.push({
      test: "Gemini direct",
      ok: false,
      cost_usd: 0,
      details: e instanceof Error ? e.message : String(e),
    });
  }

  console.log();

  // ---- Test 4 : Resend ----
  console.log(`${BOLD}4. Resend (email vers ${process.env.ADMIN_EMAIL})${RESET}`);
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    const to = process.env.ADMIN_EMAIL;
    if (!apiKey || !to) throw new Error("RESEND_API_KEY ou ADMIN_EMAIL manquant");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: "[Ankora] Test fumee Bloc 3 — connexion OK",
        html: `
          <h2>Ankora — Test fumee Bloc 3</h2>
          <p>Si tu lis ce mail, ca veut dire que :</p>
          <ul>
            <li>L'API Resend est correctement configuree</li>
            <li>Le from <code>${from}</code> est valide</li>
            <li>Les emails d'alerte budget arriveront bien dans cette boite</li>
          </ul>
          <p>Test effectue le ${new Date().toLocaleString("fr-FR")}.</p>
        `,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status} : ${errText.slice(0, 200)}`);
    }
    const data = (await res.json()) as { id?: string };
    pass(`email envoye, id : ${data.id ?? "?"}`);
    info(`destinataire : ${to}`);
    info(`from : ${from}`);
    results.push({ test: "Resend", ok: true, cost_usd: 0 });
  } catch (e) {
    fail(`echec : ${e instanceof Error ? e.message : String(e)}`);
    results.push({
      test: "Resend",
      ok: false,
      cost_usd: 0,
      details: e instanceof Error ? e.message : String(e),
    });
  }

  console.log();

  // ---- Validation api_usage ----
  console.log(`${BOLD}5. Validation api_usage (cumul mois courant)${RESET}`);
  try {
    const { getMonthToDateSpend, getBudgetStatus } = await import(
      "../lib/ai/budget-guard"
    );
    const total = await getMonthToDateSpend();
    const status = await getBudgetStatus();
    pass(`total mois courant : ${total.toFixed(6)}€`);
    info(`cap : ${status.cap_eur}€ / restant : ${status.remaining_eur.toFixed(2)}€`);
    info(`alert level : ${status.alert_level}`);
    info(`can_run_audit : ${status.can_run_audit}`);
  } catch (e) {
    fail(`echec : ${e instanceof Error ? e.message : String(e)}`);
  }

  // ---- Recap ----
  console.log(`\n${BOLD}═══════════════════ RECAP ═══════════════════${RESET}`);
  for (const r of results) {
    const icon = r.ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    const cost = r.cost_usd > 0 ? ` (${r.cost_usd.toFixed(6)}$)` : "";
    console.log(`  ${icon} ${r.test}${cost}`);
    if (r.details) console.log(`    ${YELLOW}${r.details}${RESET}`);
  }
  const allOk = results.every((r) => r.ok);
  console.log(
    `\n  ${BOLD}${allOk ? GREEN + "TOUT OK" : RED + "ECHECS DETECTES"}${RESET} — cout total tests : ${totalCostUsd.toFixed(6)}$\n`
  );

  if (!allOk) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error(`\n${RED}Erreur fatale :${RESET}`, e);
  process.exit(1);
});
