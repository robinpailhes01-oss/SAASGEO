"use client";

import * as React from "react";

import { PROGRESS_STEPS, computeStepStates } from "@/lib/progress/steps-catalog";
import { StepLine } from "./StepLine";

// =====================================================================
// <StepsList /> — affiche la liste verticale des 13 etapes.
//
// Auto-scroll : a chaque changement de l'etape "current", on fait
// defiler la viewport vers cette etape (smooth, centree). On respecte
// `prefers-reduced-motion` en passant `behavior: "auto"`.
// =====================================================================

type StepsListProps = {
  progress: number;
};

export function StepsList({ progress }: StepsListProps) {
  const states = React.useMemo(() => computeStepStates(progress), [progress]);
  const currentIndex = states.findIndex((s) => s === "current");
  const itemRefs = React.useRef<Array<HTMLLIElement | null>>([]);

  // Auto-scroll vers l'etape courante
  React.useEffect(() => {
    if (currentIndex < 0) return;
    const el = itemRefs.current[currentIndex];
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "center",
    });
  }, [currentIndex]);

  return (
    <ol className="space-y-3 sm:space-y-4" aria-label="Étapes de l'audit">
      {PROGRESS_STEPS.map((step, i) => (
        <div
          key={step.id}
          ref={(el) => {
            itemRefs.current[i] = el as HTMLLIElement | null;
          }}
        >
          <StepLine step={step} state={states[i]} index={i} />
        </div>
      ))}
    </ol>
  );
}
