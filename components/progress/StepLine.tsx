"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ProgressStep, StepState } from "@/lib/progress/steps-catalog";

// =====================================================================
// <StepLine /> — affiche une etape de l'audit en cours.
//
// Etats visuels :
//   - done    : checkmark vert, opacite 100%, details visibles
//   - current : spinner indigo + halo gradient, opacite 100%
//   - pending : numero gris, opacite 40%, details masques
//
// Les chiffres / KPI s'affichent en font mono pour l'effet "console"
// que demande le brief Bloc 5.
// =====================================================================

const detailColor: Record<"success" | "warning" | "neutral", string> = {
  success: "text-success",
  warning: "text-warning",
  neutral: "text-ankora-text-soft",
};

const detailIcon: Record<"success" | "warning" | "neutral", string> = {
  success: "✓", // ✓
  warning: "⚠", // ⚠
  neutral: "•", // •
};

type StepLineProps = {
  step: ProgressStep;
  state: StepState;
  index: number;
};

export function StepLine({ step, state, index }: StepLineProps) {
  const isDone = state === "done";
  const isCurrent = state === "current";
  const isPending = state === "pending";

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{
        opacity: isPending ? 0.4 : 1,
        y: 0,
      }}
      transition={{ duration: 0.45, delay: index * 0.04, ease: "easeOut" }}
      className={cn(
        "rounded-2xl border bg-card p-4 sm:p-5 transition-colors",
        isCurrent
          ? "border-primary/30 shadow-ankora-soft"
          : "border-ankora-border"
      )}
      aria-current={isCurrent ? "step" : undefined}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        {/* Indicateur d'etat */}
        <div
          aria-hidden="true"
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base sm:text-lg",
            isDone && "bg-success/10 text-success",
            isCurrent &&
              "bg-ankora-gradient text-white shadow-[0_0_16px_rgba(167,139,250,0.45)]",
            isPending && "bg-secondary text-ankora-text-muted"
          )}
        >
          {isDone ? (
            <Check className="h-5 w-5" strokeWidth={3} />
          ) : isCurrent ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <span className="text-sm font-mono font-semibold">
              {String(index + 1).padStart(2, "0")}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl leading-none" aria-hidden="true">
              {step.emoji}
            </span>
            <h3
              className={cn(
                "font-display text-base sm:text-lg font-semibold leading-snug",
                isPending ? "text-ankora-text-muted" : "text-ankora-text"
              )}
            >
              {step.title}
            </h3>
          </div>

          {!isPending && step.details.length > 0 && (
            <ul className="mt-2 space-y-1">
              {step.details.map((d, i) => (
                <li
                  key={i}
                  className={cn(
                    "flex items-start gap-2 text-sm leading-relaxed font-mono",
                    detailColor[d.kind]
                  )}
                >
                  <span aria-hidden="true" className="select-none">
                    {detailIcon[d.kind]}
                  </span>
                  <span>{d.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </motion.li>
  );
}
