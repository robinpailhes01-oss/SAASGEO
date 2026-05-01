"use client";

import * as React from "react";
import { Bot, FileQuestion, Search, Zap } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Container } from "@/components/layout/Container";
import { AnimatedSection } from "./AnimatedSection";
import { cn } from "@/lib/utils";

// =====================================================================
// <MetricsBar /> — 4 KPI cards qui ancrent le serieux d'Ankora.
//
// Inspiration : KPI rows de TrendTide / Appvia (cards horizontales
// avec icone + chiffre geant + label). Tous les chiffres sont REELS :
//   - 4 IA testees (ChatGPT, Claude, Perplexity, Gemini)
//   - 30 questions generees par audit
//   - 51 criteres techniques verifies
//   - ~5 minutes de generation
//
// Disposition : grid 2x2 mobile, 1x4 desktop. Pas d'animation lourde,
// chaque card a un hover lift subtil.
// =====================================================================

type Metric = {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  label: string;
  sublabel: string;
  color: string;
};

const METRICS: Metric[] = [
  {
    icon: Bot,
    value: "4",
    label: "IA testées",
    sublabel: "ChatGPT, Claude, Perplexity, Gemini",
    color: "text-primary",
  },
  {
    icon: FileQuestion,
    value: "30",
    label: "questions générées",
    sublabel: "Adaptées à votre activité",
    color: "text-fuchsia-500",
  },
  {
    icon: Search,
    value: "51",
    label: "critères techniques",
    sublabel: "Audit complet de votre site",
    color: "text-rose-500",
  },
  {
    icon: Zap,
    value: "~5",
    label: "minutes",
    sublabel: "Rapport généré en temps réel",
    color: "text-amber-500",
  },
];

export function MetricsBar() {
  return (
    <AnimatedSection
      className="py-12 sm:py-16"
      aria-labelledby="metrics-title"
    >
      <Container>
        <h2 id="metrics-title" className="sr-only">
          Ce que mesure Ankora
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {METRICS.map((m) => {
            const Icon = m.icon;
            return (
              <li key={m.label}>
                <Card
                  className={cn(
                    "h-full border-ankora-border",
                    "transition-all hover:shadow-ankora-card hover:-translate-y-0.5"
                  )}
                >
                  <CardContent className="pt-5 pb-5 px-4 sm:pt-6 sm:pb-6 sm:px-5">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary/60",
                          m.color
                        )}
                        aria-hidden="true"
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-display text-2xl sm:text-3xl font-bold leading-none tabular-nums text-ankora-text">
                          {m.value}
                        </p>
                        <p className="mt-0.5 text-xs sm:text-sm font-medium text-ankora-text">
                          {m.label}
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-ankora-text-muted leading-snug">
                      {m.sublabel}
                    </p>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      </Container>
    </AnimatedSection>
  );
}
