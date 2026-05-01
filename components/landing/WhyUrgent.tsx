// =====================================================================
// <WhyUrgent /> — section "Vos clients utilisent deja les IA".
//
// V2 (Landing v2) : layout 2 colonnes desktop (texte + 3 stats a
// gauche, AISearchMockup a droite) qui s'empile en 1 colonne mobile.
// L'ajout du mockup style chat ChatGPT avec overlay "marque absente"
// cree le declic emotionnel : les chiffres + une preuve visuelle.
//
// Bloc compact, ton serieux. Etape 2 du parcours surprise -> inquietude
// -> espoir. Chiffre cle mis en avant en gros pour ancrer la realite.
// =====================================================================

import { TrendingUp, AlertTriangle, Eye } from "lucide-react";

import { AnimatedSection } from "./AnimatedSection";
import { AISearchMockup } from "./AISearchMockup";
import { Container } from "@/components/layout/Container";
import { Card, CardContent } from "@/components/ui/card";

const stats: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}[] = [
  {
    icon: TrendingUp,
    value: "+200%",
    label: "d'usage des IA pour la recherche en 18 mois",
  },
  {
    icon: Eye,
    value: "70%",
    label: "des Français utiliseront une IA pour acheter en 2026",
  },
  {
    icon: AlertTriangle,
    value: "1 sur 3",
    label: "des marques sont déjà recommandées par défaut",
  },
];

export function WhyUrgent() {
  return (
    <AnimatedSection
      className="py-20 sm:py-28 bg-secondary/40"
      aria-labelledby="urgent-title"
    >
      <Container>
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:items-center">
          {/* Colonne texte + stats */}
          <div>
            <h2
              id="urgent-title"
              className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-ankora-text"
            >
              Vos clients utilisent déjà les IA
            </h2>
            <p className="mt-5 text-base sm:text-lg text-ankora-text-soft leading-relaxed max-w-xl">
              Les IA conversationnelles transforment la recherche en ligne. Si
              ChatGPT ne recommande pas votre marque, vous perdez des clients
              chaque jour sans le savoir. Vos concurrents, eux, sont déjà
              visibles.
            </p>

            <ul className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 lg:gap-3">
              {stats.map((stat, i) => {
                const Icon = stat.icon;
                return (
                  <li key={stat.label}>
                    <AnimatedSection as="div" delay={i * 0.08}>
                      <Card className="h-full">
                        <CardContent className="pt-5 pb-5 px-4 lg:flex lg:items-center lg:gap-4">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary lg:h-11 lg:w-11">
                            <Icon className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <div className="mt-3 lg:mt-0">
                            <p className="font-mono text-2xl lg:text-3xl font-semibold text-ankora-text leading-none">
                              {stat.value}
                            </p>
                            <p className="mt-1.5 text-xs sm:text-sm text-ankora-text-soft leading-snug">
                              {stat.label}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </AnimatedSection>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Colonne mockup */}
          <div className="flex items-center justify-center">
            <AISearchMockup />
          </div>
        </div>
      </Container>
    </AnimatedSection>
  );
}
