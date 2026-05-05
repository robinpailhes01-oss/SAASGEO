"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { TrendingUp, Users, Target, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Container } from "@/components/layout/Container";
import { cn } from "@/lib/utils";

// =====================================================================
// <MarketStats /> — 4 statistiques externes sourcees sur la landing.
//
// CRITIQUE : aucune stat sans source visible. C'est la credibilite
// d'Ankora qui est en jeu. Chaque chiffre est libelle + immediatement
// suivi de la source (annee comprise) en petit caractere.
//
// Design : 4 cards 2x2 mobile / 4x1 desktop, alignees avec MetricsBar
// pour coherence visuelle. Chiffre principal en font display large,
// label dessous, source en bas en text-xs muted.
// =====================================================================

type Stat = {
  icon: LucideIcon;
  value: string;
  // Couleur d'accent de l'icone (cohérente avec WhyAnkora)
  color: string;
  bg: string;
  label: string;
  source: string;
};

const STATS: Stat[] = [
  {
    icon: Users,
    value: "800M",
    color: "text-primary",
    bg: "bg-primary/15",
    label: "utilisateurs actifs sur ChatGPT chaque semaine",
    source: "OpenAI, octobre 2025",
  },
  {
    icon: Target,
    value: "1,2 %",
    color: "text-fuchsia-600",
    bg: "bg-fuchsia-500/15",
    label: "des commerces locaux sont cités par les IA",
    source: "SOCi 2026 — Local Visibility Index",
  },
  {
    icon: Zap,
    value: "4,4 ×",
    color: "text-rose-600",
    bg: "bg-rose-500/15",
    label: "meilleure conversion depuis les IA vs Google",
    source: "Semrush, 2025",
  },
  {
    icon: TrendingUp,
    value: "+527 %",
    color: "text-amber-600",
    bg: "bg-amber-500/15",
    label: "de trafic depuis les IA en 5 mois (jan→mai 2025)",
    source: "Analyse 17 000 → 107 000 sessions",
  },
];

export function MarketStats() {
  const reduce = useReducedMotion();

  return (
    <section
      className="py-16 sm:py-20"
      aria-labelledby="market-stats-title"
    >
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs sm:text-sm font-medium uppercase tracking-[0.2em] text-ankora-text-muted">
            Le marché des IA conversationnelles
          </p>
          <h2
            id="market-stats-title"
            className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-tight text-ankora-text"
          >
            Pourquoi c&apos;est urgent
          </h2>
          <p className="mt-3 text-base sm:text-lg text-ankora-text-soft">
            Les chiffres réels du marché conversationnel, sources publiques.
          </p>
        </div>

        <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {STATS.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.li
                key={s.label}
                initial={reduce ? false : { opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "0px 0px -100px 0px" }}
                transition={{
                  duration: 0.5,
                  delay: i * 0.08,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <Card className="h-full border-ankora-border transition-all hover:shadow-ankora-card hover:-translate-y-0.5">
                  <CardContent className="pt-5 pb-5 px-4 sm:pt-6 sm:pb-6 sm:px-5 flex flex-col h-full">
                    <span
                      className={cn(
                        "inline-flex h-9 w-9 items-center justify-center rounded-xl",
                        s.bg,
                        s.color
                      )}
                      aria-hidden="true"
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <p className="mt-4 font-display text-3xl sm:text-4xl font-bold leading-none tabular-nums text-ankora-text">
                      {s.value}
                    </p>
                    <p className="mt-2 text-sm sm:text-base font-medium text-ankora-text leading-snug flex-1">
                      {s.label}
                    </p>
                    <p className="mt-3 text-[11px] text-ankora-text-muted leading-snug">
                      Source&nbsp;: {s.source}
                    </p>
                  </CardContent>
                </Card>
              </motion.li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
