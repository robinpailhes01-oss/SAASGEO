"use client";

import * as React from "react";
import { Layers, Languages, Target } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Container } from "@/components/layout/Container";
import { AnimatedSection } from "./AnimatedSection";
import { cn } from "@/lib/utils";

// =====================================================================
// <WhyAnkora /> — section "Pourquoi Ankora" : 3 features differenciantes.
//
// Cards horizontales avec icone en haut, titre, description. Hover lift
// subtil. Anime au scroll par AnimatedSection (whileInView margin -120).
//
// Wording : positionnement multi-secteurs (tourisme, e-commerce, services,
// B2B...). Aucune mention de "GEO" jargon dans les descriptions —
// l'eyebrow Hero suffit pour le mot-cle SEO.
// =====================================================================

type Feature = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  accent: string; // tailwind text color class
  bg: string; // tailwind bg color class for icon
};

const FEATURES: Feature[] = [
  {
    icon: Layers,
    title: "Adapté à votre secteur",
    description:
      "Templates adaptés à votre activité, vocabulaire de vos clients réels, concurrents identifiés. Tourisme, e-commerce, services, B2B.",
    accent: "text-primary",
    bg: "bg-primary/15",
  },
  {
    icon: Languages,
    title: "100% en français",
    description:
      "Audit en français, rapport en français, pour des clients français. Le seul outil pensé pour votre marché.",
    accent: "text-fuchsia-600",
    bg: "bg-fuchsia-500/15",
  },
  {
    icon: Target,
    title: "Plan d'action concret",
    description:
      "Pas juste un score. Trois actions prioritaires avec impact estimé pour remonter votre visibilité dès 30 jours.",
    accent: "text-rose-600",
    bg: "bg-rose-500/15",
  },
];

export function WhyAnkora() {
  return (
    <AnimatedSection
      id="pourquoi"
      className="py-20 sm:py-24"
      aria-labelledby="why-ankora-title"
    >
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="why-ankora-title"
            className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-ankora-text"
          >
            Pourquoi Ankora
          </h2>
          <p className="mt-4 text-base sm:text-lg text-ankora-text-soft">
            Trois différences qui changent tout pour les marques françaises.
          </p>
        </div>

        <ul className="mt-12 grid gap-5 md:grid-cols-3 md:gap-6">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <li key={f.title}>
                <AnimatedSection as="div" delay={i * 0.08}>
                  <Card
                    className={cn(
                      "h-full border-ankora-border",
                      "transition-all hover:shadow-ankora-card hover:-translate-y-0.5"
                    )}
                  >
                    <CardContent className="pt-7 pb-7 px-5 sm:px-6">
                      <span
                        className={cn(
                          "flex h-12 w-12 items-center justify-center rounded-2xl",
                          f.bg,
                          f.accent
                        )}
                        aria-hidden="true"
                      >
                        <Icon className="h-6 w-6" />
                      </span>
                      <h3 className="mt-5 font-display text-lg sm:text-xl font-semibold text-ankora-text">
                        {f.title}
                      </h3>
                      <p className="mt-2 text-sm sm:text-base text-ankora-text-soft leading-relaxed">
                        {f.description}
                      </p>
                    </CardContent>
                  </Card>
                </AnimatedSection>
              </li>
            );
          })}
        </ul>
      </Container>
    </AnimatedSection>
  );
}
