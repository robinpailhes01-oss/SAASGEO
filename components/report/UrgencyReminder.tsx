"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Sparkles } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { scoreTone } from "@/lib/report/types";
import { cn } from "@/lib/utils";

// =====================================================================
// <UrgencyReminder /> — bloc 8 : rappel d'urgence (ou de leadership).
//
// Encadre pleine largeur, fond legerement teinte selon le ton du score.
// Texte centre, gros (text-xl), icone d'alerte ou d'etoile selon le
// contexte. Animation : simple fade-in au scroll.
//
// Wording : aucun anglicisme, vocabulaire business pur (pas de "GEO",
// "LLM", "tokens").
// =====================================================================

type UrgencyReminderProps = {
  globalScore: number;
};

export function UrgencyReminder({ globalScore }: UrgencyReminderProps) {
  const reduce = useReducedMotion();
  const tone = scoreTone(globalScore);
  const isPositive = tone === "high";

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -100px 0px" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      aria-label="Rappel d'urgence"
    >
      <Card
        className={cn(
          "border-2",
          tone === "low" && "border-destructive/30 bg-destructive/5",
          tone === "medium" && "border-warning/30 bg-warning/5",
          tone === "high" && "border-success/30 bg-success/5"
        )}
      >
        <CardContent className="pt-8 pb-8 px-6 sm:px-10 text-center">
          {/* Icone */}
          <div className="flex justify-center mb-4">
            <span
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-2xl",
                tone === "low" && "bg-destructive/15 text-destructive",
                tone === "medium" && "bg-warning/15 text-warning",
                tone === "high" && "bg-success/15 text-success"
              )}
              aria-hidden="true"
            >
              {isPositive ? (
                <Sparkles className="h-6 w-6" />
              ) : (
                <AlertTriangle className="h-6 w-6" />
              )}
            </span>
          </div>

          {/* Texte principal */}
          <p className="font-display text-xl sm:text-2xl font-semibold leading-snug text-ankora-text max-w-3xl mx-auto">
            {isPositive ? (
              <>
                Vous êtes en avance sur{" "}
                <span className="text-success">80% de votre marché</span>.
                Maintenez votre avance avec un suivi régulier.
              </>
            ) : (
              <>
                Les IA conversationnelles transforment la recherche en ligne.
                Aujourd&apos;hui, vos concurrents sont visibles et vous ne
                l&apos;êtes pas.{" "}
                <span
                  className={cn(
                    tone === "low" ? "text-destructive" : "text-warning"
                  )}
                >
                  Chaque jour qui passe, ils prennent de l&apos;avance.
                </span>
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </motion.section>
  );
}
