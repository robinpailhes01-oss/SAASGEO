"use client";

import * as React from "react";
import { motion } from "framer-motion";

import { CountUpNumber } from "./CountUpNumber";
import { scoreTone, type ProviderScore, type ScoreTone } from "@/lib/report/types";
import { cn } from "@/lib/utils";

// =====================================================================
// <ScoreHero /> — bloc 1 du rapport.
//
// Score global affiche en TRES gros, anime de 0 vers la valeur finale
// (count-up 1.5s easeOutCubic). Couleur dynamique selon le tier :
//   - low  (<40)   : rouge destructive
//   - medium (40-69) : orange warning
//   - high (>=70) : vert success
//
// En dessous, 4 mini-scores par IA en font mono pour ancrer le serieux
// ("on a vraiment mesure"). Chaque mini-score a sa propre count-up
// avec un leger stagger pour que l'oeil les decouvre l'un apres l'autre.
// =====================================================================

type ScoreHeroProps = {
  globalScore: number;
  perProvider: ProviderScore[];
};

const toneClass: Record<ScoreTone, string> = {
  low: "text-destructive",
  medium: "text-warning",
  high: "text-success",
};

const toneGlow: Record<ScoreTone, string> = {
  low: "drop-shadow-[0_0_32px_rgba(239,68,68,0.25)]",
  medium: "drop-shadow-[0_0_32px_rgba(245,158,11,0.25)]",
  high: "drop-shadow-[0_0_32px_rgba(16,185,129,0.25)]",
};

export function ScoreHero({ globalScore, perProvider }: ScoreHeroProps) {
  const tone = scoreTone(globalScore);

  return (
    <section
      className="text-center"
      aria-labelledby="score-hero-label"
    >
      <p
        id="score-hero-label"
        className="text-xs sm:text-sm font-medium uppercase tracking-[0.2em] text-ankora-text-muted"
      >
        Votre score AI Visibility
      </p>

      {/* Score geant */}
      <div className="mt-6 flex items-end justify-center gap-2 sm:gap-3 leading-none">
        <CountUpNumber
          to={globalScore}
          durationMs={1500}
          ariaLabel={`Score : ${Math.round(globalScore)} sur 100`}
          className={cn(
            "font-display font-bold tracking-tight tabular-nums",
            "text-7xl sm:text-8xl md:text-9xl",
            toneClass[tone],
            toneGlow[tone]
          )}
        />
        <span
          className={cn(
            "font-display font-semibold text-3xl sm:text-4xl md:text-5xl pb-2 sm:pb-3 md:pb-4",
            "text-ankora-text-muted"
          )}
          aria-hidden="true"
        >
          /100
        </span>
      </div>

      {/* Mini-scores par IA */}
      <ul
        className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 max-w-2xl mx-auto"
        aria-label="Scores détaillés par IA"
      >
        {perProvider.map((p, i) => (
          <motion.li
            key={p.provider}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.6 + i * 0.1, ease: "easeOut" }}
            className="rounded-2xl border border-ankora-border bg-card p-4"
          >
            <p
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: p.color }}
            >
              {p.label}
            </p>
            <p className="mt-1 font-mono text-2xl sm:text-3xl font-bold tabular-nums text-ankora-text">
              <CountUpNumber to={p.score} durationMs={1200} delayMs={600 + i * 100} />
              <span className="text-base text-ankora-text-muted font-normal">
                /100
              </span>
            </p>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
