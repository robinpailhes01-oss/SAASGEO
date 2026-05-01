"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ClipboardList, ArrowRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { PriorityAction } from "@/lib/report/types";
import { cn } from "@/lib/utils";

// =====================================================================
// <PriorityActions /> — bloc 7 : top 3 actions a haute valeur.
//
// 3 cards horizontales sur desktop, empilees sur mobile. Chaque card
// affiche un GROS numero gradient (1/2/3), un titre court, une
// description en 1 ligne et un badge d'impact estime ("+15 points en
// 30 jours") ancrant le ROI.
//
// Footer subtil : "Plan complet de N actions presente en consultation"
// — N depend du nombre reel de recommendations en DB (recommendations
// .total_count). Si <3 recos en DB, le footer reste pertinent grace
// aux fallback templates renvoyes par get-report.
// =====================================================================

type PriorityActionsProps = {
  actions: PriorityAction[]; // exactement 3 (fallback DEEP en lib/report)
  totalCount: number; // total reel de recommendations en DB
};

export function PriorityActions({ actions, totalCount }: PriorityActionsProps) {
  const reduce = useReducedMotion();

  if (actions.length === 0) return null;

  // Pour le footer : on parle de "13 actions" si N>=10, sinon on garde
  // le compte reel ; si N=0 (cas super rare), on glisse "plan complet"
  // sans chiffre.
  const planLabel =
    totalCount > 3
      ? `Plan complet de ${totalCount} actions présenté en consultation`
      : "Plan complet présenté en consultation";

  return (
    <section className="space-y-8" aria-labelledby="priority-actions-label">
      <div className="text-center">
        <h2
          id="priority-actions-label"
          className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-ankora-text"
        >
          Ce qu&apos;il faut faire
        </h2>
        <p className="mt-2 text-base text-ankora-text-soft">
          Les 3 actions à plus haut impact pour devenir visible dans les IA.
        </p>
      </div>

      <div className="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-3">
        {actions.map((a, i) => (
          <motion.div
            key={a.position}
            initial={reduce ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{
              duration: 0.5,
              delay: i * 0.15,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <Card
              className={cn(
                "h-full border-ankora-border bg-gradient-to-br from-card to-primary/[0.03]",
                "hover:shadow-md hover:-translate-y-0.5 transition-all"
              )}
            >
              <CardContent className="pt-6 pb-6 space-y-4 flex flex-col h-full">
                {/* Numero geant gradient */}
                <span
                  aria-hidden="true"
                  className="font-display text-6xl sm:text-7xl font-bold leading-none bg-gradient-to-br from-primary via-primary/80 to-primary/40 bg-clip-text text-transparent"
                >
                  {a.position}
                </span>

                {/* Titre */}
                <h3 className="font-display text-lg sm:text-xl font-semibold leading-tight text-ankora-text">
                  {a.title}
                </h3>

                {/* Description */}
                <p className="text-sm text-ankora-text-soft leading-relaxed flex-1">
                  {a.description}
                </p>

                {/* Badge impact */}
                <div className="pt-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1.5 text-xs font-semibold text-success">
                    <ArrowRight className="h-3.5 w-3.5" />
                    {a.impact_label}
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Footer plan complet */}
      <p className="text-center text-sm text-ankora-text-muted flex items-center justify-center gap-2">
        <ClipboardList className="h-4 w-4" aria-hidden="true" />
        {planLabel}
      </p>
    </section>
  );
}
