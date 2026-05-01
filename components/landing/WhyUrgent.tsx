// =====================================================================
// <WhyUrgent /> — section "Vos clients utilisent deja les IA".
//
// Bloc compact, ton serieux, leger en visuel. L'objectif emotionnel
// est l'inquietude (etape 2 du parcours surprise -> inquietude -> espoir).
// Chiffre cle mis en avant en gros pour ancrer la realite.
// =====================================================================

import { TrendingUp, AlertTriangle, Eye } from "lucide-react";

import { AnimatedSection } from "./AnimatedSection";
import { Container } from "@/components/layout/Container";
import { Card, CardContent } from "@/components/ui/card";

const stats: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }[] = [
  {
    icon: TrendingUp,
    value: "+200%",
    label: "d'usage des IA pour la recherche en 18 mois",
  },
  {
    icon: Eye,
    value: "70%",
    label: "des Francais utiliseront une IA pour acheter en 2026",
  },
  {
    icon: AlertTriangle,
    value: "1 sur 3",
    label: "des marques sont deja recommandees par defaut",
  },
];

export function WhyUrgent() {
  return (
    <AnimatedSection
      className="py-20 sm:py-28 bg-secondary/40"
      aria-labelledby="urgent-title"
    >
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <h2
            id="urgent-title"
            className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-ankora-text"
          >
            Vos clients utilisent deja les IA
          </h2>
          <p className="mt-5 text-base sm:text-lg text-ankora-text-soft leading-relaxed">
            Les IA conversationnelles transforment la recherche en ligne. Si ChatGPT ne recommande pas votre marque, vous perdez des clients chaque jour sans le savoir. Vos concurrents, eux, sont deja visibles.
          </p>
        </div>

        <ul className="mt-12 grid gap-4 sm:grid-cols-3 sm:gap-6">
          {stats.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <li key={stat.label}>
                <AnimatedSection as="div" delay={i * 0.08}>
                  <Card className="h-full">
                    <CardContent className="pt-7 pb-6 text-center">
                      <Icon className="mx-auto h-6 w-6 text-primary" aria-hidden="true" />
                      <p className="mt-4 font-mono text-3xl font-semibold text-ankora-text">
                        {stat.value}
                      </p>
                      <p className="mt-2 text-sm text-ankora-text-soft leading-snug">
                        {stat.label}
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
