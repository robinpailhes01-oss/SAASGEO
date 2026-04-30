// =====================================================================
// CLI : pnpm audit https://example.com [--quiet] [--out custom-name.json]
//
// Lance un audit technique sur l'URL passee en argument et :
//  - log la progression dans la console
//  - sauvegarde le JSON brut dans outputs/audits/{date}-{domain}.json
//  - affiche un recap visuel a la fin (scores par categorie + global)
// =====================================================================

import { runTechAudit } from "../lib/scraping/tech-audit";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { CheckStatus } from "../lib/scraping/types";

function parseArgs(argv: string[]): {
  url: string;
  quiet: boolean;
  out?: string;
} {
  const args = argv.slice(2);
  let url = "";
  let quiet = false;
  let out: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--quiet" || a === "-q") {
      quiet = true;
    } else if (a === "--out") {
      out = args[++i];
    } else if (a.startsWith("http")) {
      url = a;
    }
  }
  if (!url) {
    console.error(
      "Usage : pnpm audit <url> [--quiet] [--out filename.json]\n" +
        "Exemple : pnpm audit https://harmonie-yacht.fr"
    );
    process.exit(1);
  }
  return { url, quiet, out };
}

function statusIcon(s: CheckStatus): string {
  switch (s) {
    case "pass":
      return "✓";
    case "warn":
      return "!";
    case "fail":
      return "✗";
    case "skipped":
      return "·";
  }
}

function statusColor(s: CheckStatus): string {
  // Couleurs ANSI pour terminal
  switch (s) {
    case "pass":
      return "\x1b[32m"; // vert
    case "warn":
      return "\x1b[33m"; // jaune
    case "fail":
      return "\x1b[31m"; // rouge
    case "skipped":
      return "\x1b[90m"; // gris
  }
}
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

function scoreColor(score: number): string {
  if (score >= 16) return "\x1b[32m";
  if (score >= 10) return "\x1b[33m";
  return "\x1b[31m";
}

async function main() {
  const { url, quiet, out } = parseArgs(process.argv);

  // Charger .env.local manuellement (Node n'a pas dotenv intégré dans tsx)
  try {
    const { readFileSync } = await import("node:fs");
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
  } catch {
    // ignore
  }

  console.log(
    `${BOLD}\n══════════════════════════════════════════════════════════════════════`
  );
  console.log(`  ANKORA — Audit technique GEO`);
  console.log(`  ${url}`);
  console.log(
    `══════════════════════════════════════════════════════════════════════${RESET}\n`
  );

  const result = await runTechAudit(url, { verbose: !quiet });

  // Sauvegarde JSON brut
  const outputsDir = resolve("outputs/audits");
  mkdirSync(outputsDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const filename =
    out ?? `${date}-${result.domain.replace(/\./g, "_")}.json`;
  const fullPath = resolve(outputsDir, filename);
  writeFileSync(fullPath, JSON.stringify(result, null, 2));

  // ---- Recap visuel ----
  console.log(`\n${BOLD}── Recap audit ──${RESET}`);
  console.log(
    `  Domaine        : ${result.domain}`
  );
  console.log(`  Langue         : ${result.language ?? "non detectee"}`);
  console.log(
    `  Methodes fetch : ${result.metadata.fetch_methods_used.join(", ")}`
  );
  console.log(`  SPA detecte    : ${result.metadata.is_spa ? "oui" : "non"}`);
  console.log(`  Pages sample   : ${result.metadata.sampled_pages_count}`);
  console.log(`  robots.txt     : ${result.metadata.has_robots ? "✓" : "✗"}`);
  console.log(`  sitemap.xml    : ${result.metadata.has_sitemap ? "✓" : "✗"}`);
  console.log(`  llms.txt       : ${result.metadata.has_llms_txt ? "✓" : "✗"}`);
  console.log(`  Duree          : ${(result.duration_ms / 1000).toFixed(1)}s`);

  console.log(`\n${BOLD}── Scores par categorie ──${RESET}`);
  for (const cat of result.categories) {
    const sCol = scoreColor(cat.score);
    const passed = cat.checks.filter((c) => c.status === "pass").length;
    const warned = cat.checks.filter((c) => c.status === "warn").length;
    const failed = cat.checks.filter((c) => c.status === "fail").length;
    const skipped = cat.checks.filter((c) => c.status === "skipped").length;
    console.log(
      `  ${sCol}${BOLD}${cat.score.toString().padStart(2)}/20${RESET} ` +
        `${cat.label.padEnd(45)} ` +
        `\x1b[32m${passed}p${RESET} \x1b[33m${warned}w${RESET} \x1b[31m${failed}f${RESET} \x1b[90m${skipped}s${RESET}`
    );
  }

  console.log();
  const tCol = scoreColor(result.total_score / 5); // /5 pour normaliser sur l'echelle /20
  console.log(
    `  ${BOLD}${tCol}SCORE TOTAL : ${result.total_score}/100${RESET}\n`
  );

  // Detail par check si pas quiet
  if (!quiet) {
    console.log(`${BOLD}── Detail des checks ──${RESET}`);
    for (const cat of result.categories) {
      console.log(
        `\n  ${BOLD}${cat.label}${RESET}  (${cat.score}/20)`
      );
      for (const c of cat.checks) {
        const ic = statusIcon(c.status);
        const co = statusColor(c.status);
        console.log(
          `    ${co}${ic}${RESET} ${c.label.padEnd(58)} ${co}${c.points_earned}/${c.points_max}${RESET}`
        );
        if (c.evidence) {
          const ev = c.evidence.length > 100 ? c.evidence.slice(0, 97) + "..." : c.evidence;
          console.log(`      \x1b[90m└ ${ev}${RESET}`);
        }
        if (c.recommendation && (c.status === "fail" || c.status === "warn")) {
          const r =
            c.recommendation.length > 110
              ? c.recommendation.slice(0, 107) + "..."
              : c.recommendation;
          console.log(`      \x1b[36m  → ${r}${RESET}`);
        }
      }
    }
  }

  console.log(`\n${BOLD}JSON sauvegarde : ${fullPath}${RESET}\n`);
}

main().catch((e) => {
  console.error("\n\x1b[31mErreur durant l'audit :\x1b[0m", e);
  process.exit(1);
});
