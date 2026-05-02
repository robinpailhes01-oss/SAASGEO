"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";

import type { CompetitorRanking } from "@/lib/report/types";
import { cn } from "@/lib/utils";

// =====================================================================
// <TopCompetitors /> — bloc 4 du rapport : classement IA.
//
// V3 (correction cohérence) : on construit un classement UNIFIE
// {brand + competitors} trie par mentions DESC. La couleur de la ligne
// VOUS depend de son rang reel :
//   - rank 1 -> success (le client domine)
//   - rank 2 -> warning (challenger serieux)
//   - rank 3+ -> destructive (le client est distance)
//
// Avant cette correction, VOUS etait toujours en bas et toujours en
// destructive, meme quand le client avait LE meilleur score (cas
// observe : Hotel Neptune 60/120 affiche en rouge alors qu'il etait
// largement leader). Le rapport est desormais coherent avec les
// chiffres.
//
// Animation : stagger 0.18s sur les lignes, separateur supprime
// (perd son sens dans une liste sortee).
// =====================================================================

type TopCompetitorsProps = {
  competitors: CompetitorRanking[]; // 0..3 entrees
  brandName: string;
  yourMentions: number; // mentions sur 120 (= totalQueries * 4)
  totalQueries: number;
};

const MEDALS = ["🥇", "🥈", "🥉"] as const;

// Type interne unifie pour le tri
type RankedRow = {
  kind: "brand" | "competitor";
  name: string;
  mentions: number;
};

// Couleurs des cartes par rang (du plus chaud au plus neutre).
// Pour les rangs > 3, on tombe en card neutre.
const RANK_TINT: Record<number, string> = {
  0: "from-amber-100/60 via-amber-50/40 to-transparent border-amber-300/50", // or
  1: "from-slate-200/60 via-slate-100/40 to-transparent border-slate-300/60", // argent
  2: "from-orange-200/40 via-orange-100/30 to-transparent border-orange-300/40", // bronze
};

// Couleur de la ligne VOUS selon le rang reel.
// Brief : "rouge si rank > 1, vert/neutre si rank = 1".
function brandRowTone(rank: number): {
  border: string;
  bg: string;
  badge: string;
  countText: string;
} {
  if (rank === 0) {
    return {
      border: "border-success/40",
      bg: "bg-success/5",
      badge: "bg-success/15 text-success",
      countText: "text-success",
    };
  }
  if (rank === 1) {
    return {
      border: "border-warning/40",
      bg: "bg-warning/5",
      badge: "bg-warning/15 text-warning",
      countText: "text-warning",
    };
  }
  return {
    border: "border-destructive/40",
    bg: "bg-destructive/5",
    badge: "bg-destructive/15 text-destructive",
    countText: "text-destructive",
  };
}

// Construit le classement unifie : merge brand + competitors, trie
// par mentions desc, garde max 4 lignes (top 3 + brand si hors podium).
function buildRanking(
  brandName: string,
  yourMentions: number,
  competitors: CompetitorRanking[]
): { rows: RankedRow[]; brandRank: number } {
  const all: RankedRow[] = [
    { kind: "brand", name: brandName, mentions: yourMentions },
    ...competitors.map((c) => ({
      kind: "competitor" as const,
      name: c.name,
      mentions: c.mentions,
    })),
  ];

  // Tri stable par mentions desc, puis nom asc pour deterministe
  all.sort((a, b) => {
    if (b.mentions !== a.mentions) return b.mentions - a.mentions;
    return a.name.localeCompare(b.name);
  });

  const brandRank = all.findIndex((r) => r.kind === "brand");

  // Si le brand est dans le top 3, on prend juste les 4 premiers (au cas
  // ou il y a un 4eme concurrent populaire). Si le brand est >= 4eme,
  // on prend top 3 competitors + brand en derniere position.
  let rows: RankedRow[];
  if (brandRank <= 2) {
    rows = all.slice(0, Math.min(4, all.length));
  } else {
    const top3Competitors = all
      .filter((r) => r.kind === "competitor")
      .slice(0, 3);
    rows = [...top3Competitors, all[brandRank]];
  }
  // Recalcule le rank du brand dans la slice affichee
  const displayedBrandRank = rows.findIndex((r) => r.kind === "brand");
  return { rows, brandRank: displayedBrandRank };
}

export function TopCompetitors({
  competitors,
  brandName,
  yourMentions,
  totalQueries,
}: TopCompetitorsProps) {
  const reduce = useReducedMotion();

  if (competitors.length === 0 && yourMentions === 0) {
    return null;
  }

  const { rows, brandRank } = buildRanking(
    brandName,
    yourMentions,
    competitors
  );
  const denominator = totalQueries * 4;
  const brandTone = brandRowTone(brandRank);

  return (
    <section
      className="space-y-6"
      aria-labelledby="top-competitors-label"
    >
      <div className="text-center">
        <p
          id="top-competitors-label"
          className="text-xs sm:text-sm font-medium uppercase tracking-[0.2em] text-ankora-text-muted"
        >
          Classement de visibilité dans les IA
        </p>
        <p className="mt-2 text-base text-ankora-text-soft">
          Voici qui apparaît le plus quand vos clients posent des questions
          à ChatGPT, Claude, Perplexity ou Gemini.
        </p>
      </div>

      <ul className="space-y-3">
        {rows.map((row, i) => {
          const isBrand = row.kind === "brand";
          const medal = i < 3 ? MEDALS[i] : `${i + 1}.`;

          if (isBrand) {
            return (
              <motion.li
                key={`brand-${row.name}`}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.55,
                  delay: i * 0.18,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className={cn(
                  "flex items-center gap-3 sm:gap-5 rounded-2xl border-2 p-4 sm:p-5",
                  brandTone.border,
                  brandTone.bg
                )}
              >
                <span
                  className={cn(
                    "flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-xl font-display font-bold text-sm sm:text-base",
                    brandTone.badge
                  )}
                  aria-label={`Rang ${i + 1} (vous)`}
                >
                  VOUS
                </span>
                <span className="flex-1 min-w-0 font-display text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-ankora-text truncate">
                  {row.name}
                </span>
                <span className="shrink-0 font-mono tabular-nums text-right">
                  <span
                    className={cn(
                      "text-base sm:text-lg font-semibold",
                      brandTone.countText
                    )}
                  >
                    {row.mentions}
                  </span>
                  <span className="text-sm text-ankora-text-muted">
                    {" "}
                    / {denominator}
                  </span>
                </span>
              </motion.li>
            );
          }

          // Competitor row
          const tint = RANK_TINT[i] ?? "border-ankora-border bg-card";
          return (
            <motion.li
              key={`comp-${row.name}-${i}`}
              initial={reduce ? false : { opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: 0.55,
                delay: i * 0.18,
                ease: [0.22, 1, 0.36, 1],
              }}
              className={cn(
                "flex items-center gap-4 sm:gap-6 rounded-2xl border bg-gradient-to-r p-4 sm:p-5",
                tint
              )}
            >
              <span
                className="text-3xl sm:text-4xl leading-none shrink-0 font-mono font-bold text-ankora-text-muted"
                aria-label={`Rang ${i + 1}`}
                role="img"
              >
                {medal}
              </span>
              <span className="flex-1 min-w-0 font-display text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-ankora-text truncate">
                {row.name}
              </span>
              <span className="shrink-0 font-mono tabular-nums text-right">
                <span className="text-base sm:text-lg font-semibold text-ankora-text">
                  {row.mentions}
                </span>
                <span className="text-sm text-ankora-text-muted">
                  {" "}
                  / {denominator}
                </span>
              </span>
            </motion.li>
          );
        })}
      </ul>

      {/* Sous-titre dynamique selon position du brand */}
      <p className="text-center text-sm text-ankora-text-soft">
        {brandRank === 0 ? (
          <>
            Vous dominez le classement. {" "}
            <span className="text-success font-semibold">
              Maintenez votre avance.
            </span>
          </>
        ) : brandRank === 1 ? (
          <>
            Vous êtes challenger.{" "}
            <span className="text-warning font-semibold">
              Une marche à franchir pour passer leader.
            </span>
          </>
        ) : (
          <>
            Vous êtes distancé sur les recherches IA.{" "}
            <span className="text-destructive font-semibold">
              Vos concurrents captent vos clients potentiels.
            </span>
          </>
        )}
      </p>
    </section>
  );
}
