"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";

import type { CompetitorRanking } from "@/lib/report/types";
import { cn } from "@/lib/utils";

// =====================================================================
// <TopCompetitors /> — bloc 4 du rapport : podium des concurrents.
//
// Format :
//   Or  : 1er concurrent (mentions)
//   Argent : 2eme
//   Bronze : 3eme
//   ── separateur ──
//   VOUS : X mentions
//
// Animation : apparition sequentielle des 3 concurrents (stagger 0.2s),
// puis ligne de separation avec scaleX, puis "VOUS" en dernier (effet
// "moment de verite"). On respecte prefers-reduced-motion : tout
// s'affiche d'un coup, sans translation.
//
// Les NOMS DES CONCURRENTS sont en gras + plus gros que les nombres
// pour l'effet ego trigger (le prospect lit le nom de son rival).
// =====================================================================

type TopCompetitorsProps = {
  competitors: CompetitorRanking[]; // 0..3 entrees
  brandName: string;
  yourMentions: number; // queries (sur total) ou la marque apparait
  totalQueries: number;
};

const MEDALS = ["🥇", "🥈", "🥉"] as const;

// Couleurs des cartes par rang (du plus chaud au plus neutre)
const RANK_TINT: Record<number, string> = {
  0: "from-amber-100/60 via-amber-50/40 to-transparent border-amber-300/50", // or
  1: "from-slate-200/60 via-slate-100/40 to-transparent border-slate-300/60", // argent
  2: "from-orange-200/40 via-orange-100/30 to-transparent border-orange-300/40", // bronze
};

function CompetitorRow({
  rank,
  comp,
  totalQueries,
  delay,
}: {
  rank: number;
  comp: CompetitorRanking;
  totalQueries: number;
  delay: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "flex items-center gap-4 sm:gap-6 rounded-2xl border bg-gradient-to-r p-4 sm:p-5",
        RANK_TINT[rank]
      )}
    >
      <span
        className="text-3xl sm:text-4xl leading-none shrink-0"
        aria-label={`Rang ${rank + 1}`}
        role="img"
      >
        {MEDALS[rank]}
      </span>
      <span className="flex-1 min-w-0 font-display text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-ankora-text truncate">
        {comp.name}
      </span>
      <span className="shrink-0 font-mono tabular-nums text-right">
        <span className="text-base sm:text-lg font-semibold text-ankora-text">
          {comp.mentions}
        </span>
        <span className="text-sm text-ankora-text-muted">
          {" "}
          / {totalQueries * 4}
        </span>
      </span>
    </motion.li>
  );
}

export function TopCompetitors({
  competitors,
  brandName,
  yourMentions,
  totalQueries,
}: TopCompetitorsProps) {
  const reduce = useReducedMotion();

  if (competitors.length === 0) {
    return null;
  }

  // L'animation du separateur + de la ligne VOUS attend que les 3
  // medailles soient affichees. Stagger 0.2s : 0s, 0.2s, 0.4s, 0.6s
  // (separateur), 0.8s (VOUS).
  const sepDelay = competitors.length * 0.2;
  const youDelay = sepDelay + 0.2;

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
          Vos concurrents directs dans les IA
        </p>
        <p className="mt-2 text-base text-ankora-text-soft">
          Voici qui apparaît à votre place quand vos clients posent des
          questions à ChatGPT, Claude, Perplexity ou Gemini.
        </p>
      </div>

      <ul className="space-y-3">
        {competitors.map((c, i) => (
          <CompetitorRow
            key={`${c.name}-${i}`}
            rank={i}
            comp={c}
            totalQueries={totalQueries}
            delay={i * 0.2}
          />
        ))}

        {/* Separateur anime */}
        <motion.li
          aria-hidden="true"
          initial={reduce ? false : { scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: sepDelay, ease: "easeOut" }}
          className="origin-center"
        >
          <div className="my-2 h-px w-full bg-gradient-to-r from-transparent via-ankora-border to-transparent" />
        </motion.li>

        {/* Ligne "VOUS" — denominateur unifie sur 120 (= totalQueries * 4)
            pour comparaison juste avec les concurrents (qui sont sur 120).
            Avant, on affichait Vous /30 vs concurrent /120 = asymetrie. */}
        <motion.li
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: youDelay, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "flex items-center gap-4 sm:gap-6 rounded-2xl border-2 p-4 sm:p-5",
            // Encadre en destructive pour l'effet "moment de verite"
            "border-destructive/40 bg-destructive/5"
          )}
        >
          <span
            className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-destructive font-display font-bold text-base"
            aria-hidden="true"
          >
            VOUS
          </span>
          <span className="flex-1 min-w-0 font-display text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-ankora-text truncate">
            {brandName}
          </span>
          <span className="shrink-0 font-mono tabular-nums text-right">
            <span className="text-base sm:text-lg font-semibold text-destructive">
              {yourMentions}
            </span>
            <span className="text-sm text-ankora-text-muted">
              {" "}
              / {totalQueries * 4}
            </span>
          </span>
        </motion.li>
      </ul>
    </section>
  );
}
