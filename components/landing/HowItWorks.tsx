// =====================================================================
// <HowItWorks /> — section explicative "3 etapes" de la landing.
//
// 3 cards alignees en ligne (desktop) ou empilees (mobile). Chaque card
// affiche un grand numero degrade (1/2/3), un emoji, un titre court
// et une phrase descriptive. Pas d'animation lourde : la subtilite
// vient des AnimatedSection parents (stagger via delay).
// =====================================================================

import { Card, CardContent } from "@/components/ui/card";
import { AnimatedSection } from "./AnimatedSection";
import { Container } from "@/components/layout/Container";

type Step = {
  number: string;
  emoji: string;
  title: string;
  description: string;
};

const steps: Step[] = [
  {
    number: "1",
    emoji: "\u{1F310}",
    title: "Vous donnez votre URL",
    description:
      "On analyse votre site et on identifie automatiquement votre activité, vos services et vos concurrents.",
  },
  {
    number: "2",
    emoji: "\u{1F916}",
    title: "On interroge 4 IA en votre nom",
    description:
      "30 questions clients posées à ChatGPT, Claude, Perplexity et Gemini. On capture leurs réponses brutes.",
  },
  {
    number: "3",
    emoji: "\u{1F4CA}",
    title: "Vous recevez votre rapport choc",
    description:
      "Score sur 100, concurrents qui vous devancent, plan d'action priorisé. Lisible en 2 minutes.",
  },
];

export function HowItWorks() {
  return (
    <AnimatedSection
      id="comment"
      className="py-20 sm:py-28"
      aria-labelledby="comment-title"
    >
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="comment-title"
            className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-ankora-text"
          >
            Comment ça marche
          </h2>
          <p className="mt-4 text-base sm:text-lg text-ankora-text-soft">
            Trois étapes, cinq minutes, zéro friction.
          </p>
        </div>

        <ul className="mt-14 grid gap-6 md:grid-cols-3 md:gap-8">
          {steps.map((step, i) => (
            <li key={step.number}>
              <AnimatedSection as="div" delay={i * 0.08}>
                <Card className="h-full transition-all hover:shadow-ankora-card hover:-translate-y-0.5">
                  <CardContent className="pt-8 pb-7">
                    <div className="mb-5 flex items-baseline justify-between">
                      <span
                        aria-hidden="true"
                        className="text-ankora-gradient font-display text-6xl font-bold leading-none"
                      >
                        {step.number}
                      </span>
                      <span className="text-3xl" aria-hidden="true">
                        {step.emoji}
                      </span>
                    </div>
                    <h3 className="font-display text-lg font-semibold text-ankora-text">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm text-ankora-text-soft leading-relaxed">
                      {step.description}
                    </p>
                  </CardContent>
                </Card>
              </AnimatedSection>
            </li>
          ))}
        </ul>
      </Container>
    </AnimatedSection>
  );
}
