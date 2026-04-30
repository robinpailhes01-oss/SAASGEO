// =====================================================================
// CLI : pnpm full-audit <url>
//
// Lance un audit COMPLET (technique + AI Visibility) sur une URL
// et sauve le JSON brut dans outputs/audits/{date}-full-{domain}.json
// =====================================================================

import { runFullAudit } from "../lib/ai/audit-pipeline";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Charge .env.local manuellement
if (existsSync(".env.local")) {
  const envContent = readFileSync(".env.local", "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";

function scoreColor(score: number, max = 100): string {
  const ratio = score / max;
  if (ratio >= 0.7) return GREEN;
  if (ratio >= 0.4) return YELLOW;
  return RED;
}

async function main() {
  const url = process.argv[2];
  if (!url || !url.startsWith("http")) {
    console.error("Usage : pnpm full-audit <url>");
    console.error("Exemple : pnpm full-audit https://harmonie-yacht.fr");
    process.exit(1);
  }

  console.log(`${BOLD}\n══════════════════════════════════════════════════════════════════════`);
  console.log(`  ANKORA — Audit COMPLET (technique + AI Visibility)`);
  console.log(`  ${url}`);
  console.log(`══════════════════════════════════════════════════════════════════════${RESET}\n`);

  const result = await runFullAudit(url);

  // Save JSON
  const outputsDir = resolve("outputs/audits");
  mkdirSync(outputsDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${date}-full-${result.technical.domain.replace(/\./g, "_")}.json`;
  const fullPath = resolve(outputsDir, filename);
  writeFileSync(fullPath, JSON.stringify(result, null, 2));

  // ---- Affichage final ----
  const techCol = scoreColor(result.scores.technical_score);
  const visCol = scoreColor(result.scores.visibility_score);
  const globCol = scoreColor(result.scores.global_score);

  console.log(`${BOLD}── Scores finaux ──${RESET}`);
  console.log(`  Score technique  : ${techCol}${BOLD}${result.scores.technical_score}/100${RESET}  (poids 40%)`);
  console.log(`  Score visibility : ${visCol}${BOLD}${result.scores.visibility_score}/100${RESET}  (poids 60%)`);
  console.log(`  ${BOLD}Score GLOBAL    : ${globCol}${result.scores.global_score}/100${RESET}\n`);

  console.log(`${BOLD}── Visibility par IA ──${RESET}`);
  for (const [provider, score] of Object.entries(result.visibility_scores.per_provider)) {
    const c = scoreColor(score);
    console.log(`  ${provider.padEnd(12)} : ${c}${score}/100${RESET}`);
  }
  console.log();

  console.log(`${BOLD}── Metriques mention ──${RESET}`);
  console.log(`  Mention rate (textuelle)  : ${result.scores.mention_rate.toFixed(1)}%`);
  console.log(`  Citation rate (sources)   : ${result.scores.citation_rate.toFixed(1)}%`);
  console.log(`  Top concurrent observe    : ${result.scores.top_competitor ?? "(aucun)"}`);
  console.log();

  console.log(`${BOLD}── Top concurrents detectes ──${RESET}`);
  for (const c of result.visibility_scores.top_competitors.slice(0, 5)) {
    console.log(`  ${c.count.toString().padStart(3)}x  ${c.name}`);
  }
  console.log();

  console.log(`${BOLD}── Verdict synthese ──${RESET}`);
  console.log(`  ${CYAN}${result.synthesis.verdict}${RESET}\n`);

  console.log(`${BOLD}── Recommandations top 5 ──${RESET}`);
  for (const r of result.synthesis.recommendations.slice(0, 5)) {
    const prCol = r.priority === "quick_win" ? GREEN : r.priority === "medium" ? YELLOW : GRAY;
    console.log(
      `  ${prCol}[${r.priority.padEnd(10)}]${RESET} ${BOLD}${r.title}${RESET}  ${GRAY}(impact ${r.impact_score}/10)${RESET}`
    );
    console.log(`              ${GRAY}${r.description.slice(0, 110)}${RESET}`);
  }
  console.log();

  console.log(`${BOLD}── Couts ──${RESET}`);
  console.log(`  Total cet audit : ${BOLD}${result.costs.total_eur.toFixed(4)}€${RESET}`);
  console.log(`  Visibility (4 IA x 30) : ${result.costs.visibility_eur.toFixed(4)}€`);
  console.log(`  Analyses (Haiku x 120) : ${result.costs.analysis_eur.toFixed(4)}€`);
  console.log();

  console.log(`${BOLD}JSON sauvegarde :${RESET} ${fullPath}\n`);
}

main().catch((e) => {
  console.error(`\n${RED}Erreur fatale :${RESET}`, e);
  process.exit(1);
});
