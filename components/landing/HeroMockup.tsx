"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkles, Trophy, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

// =====================================================================
// <HeroMockup /> — apercu du rapport Ankora dans le hero.
//
// Aperçu visuel statique d'un faux rapport, avec :
//   - Card principale en perspective legere : titre + score geant +
//     4 mini-scores par IA + mini-narratif perte
//   - Card flottante haut-gauche : top concurrent avec mentions
//   - Card flottante bas-droite : badge "+18 points en 30j"
//   - Badge honnete "Apercu demo" en coin pour transparence
//
// Tout est en CSS/SVG pur — zero image, performance Lighthouse safe.
// Animation : levitation tres subtile sur les cards flottantes (loop
// 4-5s), respect prefers-reduced-motion.
//
// Inspirations directes : SEOGenie.AI (cards flottantes hero), NuroAI
// (KPI grid central). Le design reprend EXACTEMENT le langage visuel
// du vrai rapport (font-display/mono, gradient signature, tons score).
// =====================================================================

type HeroMockupProps = {
  className?: string;
};

const PROVIDER_TILES = [
  { label: "ChatGPT", color: "#10A37F", score: 72 },
  { label: "Claude", color: "#D97757", score: 68 },
  { label: "Perplexity", color: "#20808D", score: 64 },
  { label: "Gemini", color: "#4285F4", score: 62 },
] as const;

export function HeroMockup({ className }: HeroMockupProps) {
  const reduce = useReducedMotion();

  // Animations subtiles : levitation 6px sur 4-5s, pas de rotation ni
  // d'effet 3D sur tablette/mobile pour preserver les perfs.
  const floatA = reduce
    ? undefined
    : { y: [0, -6, 0], transition: { duration: 4.5, repeat: Infinity, ease: "easeInOut" as const } };
  const floatB = reduce
    ? undefined
    : { y: [0, 6, 0], transition: { duration: 5, repeat: Infinity, ease: "easeInOut" as const, delay: 0.6 } };

  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-3xl",
        // Padding pour laisser respirer les cards flottantes
        "px-4 sm:px-8 pt-8 pb-12 sm:pb-16",
        className
      )}
      aria-hidden="true"
    >
      {/* Halo decoratif derriere la card */}
      <div
        className="pointer-events-none absolute inset-x-12 top-12 -z-10 h-2/3 rounded-[2.5rem] bg-gradient-to-br from-primary/20 via-fuchsia-500/15 to-rose-500/10 blur-3xl opacity-70"
      />

      {/* ---------- Card principale ---------- */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        className={cn(
          "relative rounded-3xl border border-ankora-border bg-card",
          "shadow-ankora-elevated overflow-hidden"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ankora-border px-5 sm:px-7 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-ankora-gradient text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <p className="text-xs font-medium text-ankora-text-muted uppercase tracking-wider">
                Aperçu rapport
              </p>
              <p className="font-display text-sm font-semibold text-ankora-text">
                exemple.com
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-ankora-text-muted">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
            Démo
          </span>
        </div>

        {/* Score géant */}
        <div className="px-5 sm:px-7 pt-7 pb-2 text-center">
          <p className="text-[10px] sm:text-xs font-medium uppercase tracking-[0.18em] text-ankora-text-muted">
            Score AI Visibility
          </p>
          <div className="mt-2 flex items-end justify-center gap-1.5 leading-none">
            <span className="font-display font-bold tabular-nums text-warning text-6xl sm:text-7xl drop-shadow-[0_0_24px_rgba(245,158,11,0.20)]">
              67
            </span>
            <span className="font-display font-semibold text-2xl sm:text-3xl text-ankora-text-muted pb-1">
              /100
            </span>
          </div>
        </div>

        {/* 4 mini-scores par IA */}
        <ul className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2 px-5 sm:px-7">
          {PROVIDER_TILES.map((p) => (
            <li
              key={p.label}
              className="rounded-xl border border-ankora-border bg-card/60 p-2.5 text-center"
            >
              <p
                className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: p.color }}
              >
                {p.label}
              </p>
              <p className="mt-0.5 font-mono text-base sm:text-lg font-bold tabular-nums text-ankora-text">
                {p.score}
                <span className="text-[10px] text-ankora-text-muted font-normal">
                  /100
                </span>
              </p>
            </li>
          ))}
        </ul>

        {/* Mini narratif perte */}
        <div className="mx-5 sm:mx-7 my-5 sm:my-6 rounded-xl bg-warning/8 border border-warning/20 px-4 py-3">
          <p className="text-xs sm:text-sm text-ankora-text-soft leading-snug text-center">
            Vous apparaissez{" "}
            <span className="font-mono font-semibold text-ankora-text">14</span>{" "}
            fois sur{" "}
            <span className="font-mono font-semibold text-ankora-text">30</span>{" "}
            questions clients —{" "}
            <span className="font-semibold text-warning">53 opportunités</span>{" "}
            manquées par jour.
          </p>
        </div>
      </motion.div>

      {/* ---------- Card flottante : Top concurrent (haut-gauche) ----------
          Visible uniquement >= lg (1024px) : sur iPad portrait elle
          chevauchait le titre central. */}
      <motion.div
        initial={reduce ? false : { opacity: 0, x: -12, y: -8 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.7 }}
        className="hidden lg:block absolute lg:left-0 lg:top-4 z-10"
      >
        <motion.div
          animate={floatA}
          className="rounded-2xl border border-ankora-border bg-card shadow-ankora-card px-3.5 py-3 sm:px-4 sm:py-3 max-w-[180px] sm:max-w-[220px]"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-2xl">
              {"\u{1F947}"}
            </span>
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-ankora-text-muted">
                Top concurrent
              </p>
              <p className="font-display text-sm font-bold text-ankora-text truncate">
                Concurrent A
              </p>
              <p className="font-mono text-[10px] text-ankora-text-soft tabular-nums">
                22 mentions / 30
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* ---------- Card flottante : impact (bas-droite) ----------
          Cachee sur mobile (<768px), version compacte md (768-1024),
          version pleine taille >= lg. */}
      <motion.div
        initial={reduce ? false : { opacity: 0, x: 12, y: 8 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.9 }}
        className="hidden md:block absolute md:right-0 md:bottom-4 lg:bottom-6 z-10"
      >
        <motion.div
          animate={floatB}
          className="rounded-2xl border border-success/30 bg-success/10 backdrop-blur-sm shadow-ankora-card px-2.5 py-2 lg:px-4 lg:py-3"
        >
          <div className="flex items-center gap-1.5 lg:gap-2">
            <span className="flex h-6 w-6 lg:h-7 lg:w-7 shrink-0 items-center justify-center rounded-lg bg-success/20 text-success">
              <ArrowUpRight className="h-3.5 w-3.5 lg:h-4 lg:w-4" strokeWidth={2.5} />
            </span>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-success/80">
                Plan d&apos;action
              </p>
              <p className="font-mono text-xs lg:text-sm font-bold tabular-nums text-success">
                +18 pts en 30j
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* ---------- Card flottante : trophée podium (top-right) ----------
          Visible uniquement >= lg : evite le chevauchement avec le score
          central sur iPad portrait. */}
      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 1.1 }}
        className="hidden lg:block absolute right-0 top-2 z-10"
      >
        <motion.div
          animate={floatA}
          className="rounded-2xl border border-ankora-border bg-card shadow-ankora-card p-3"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Trophy className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-ankora-text-muted">
                Vous
              </p>
              <p className="font-mono text-xs font-bold tabular-nums text-ankora-text">
                14 / 30
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
