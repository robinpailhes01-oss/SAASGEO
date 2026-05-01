"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Sparkles,
  Server,
  Newspaper,
  FileText,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { WhyReason } from "@/lib/report/types";
import { scoreTone } from "@/lib/report/types";
import { cn } from "@/lib/utils";

// =====================================================================
// <WhyInvisible /> — bloc 6 : 3 cards verticales expliquant POURQUOI.
//
// Genere dynamiquement selon les donnees de l'audit (failed checks
// techniques + categories generiques notoriete/contenu). Si le score
// est >= 70, on inverse le titre du bloc et on a deja des messages
// positifs (cf. lib/report/get-report -> buildWhyReasons).
//
// Design : grid responsive 1 col / 3 cols, numero gradient en haut,
// icone lucide colore selon ton, hover lift, stagger 0.15s.
// =====================================================================

type WhyInvisibleProps = {
  reasons: WhyReason[];
  globalScore: number;
};

const SLOT_ICONS: Record<WhyReason["slot"], LucideIcon> = {
  technical: Server,
  authority: Newspaper,
  content: FileText,
};

export function WhyInvisible({ reasons, globalScore }: WhyInvisibleProps) {
  const reduce = useReducedMotion();
  const tone = scoreTone(globalScore);
  const isPositive = tone === "high";

  if (reasons.length === 0) return null;

  // Couleur de l'icone et du badge selon ton (positif = vert, sinon orange)
  const accent = isPositive
    ? {
        bg: "bg-success/15",
        text: "text-success",
        ring: "ring-success/20",
        Icon: CheckCircle2,
      }
    : {
        bg: "bg-warning/15",
        text: "text-warning",
        ring: "ring-warning/20",
        Icon: AlertTriangle,
      };

  return (
    <section className="space-y-8" aria-labelledby="why-invisible-label">
      <div className="text-center">
        <h2
          id="why-invisible-label"
          className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-ankora-text"
        >
          {isPositive ? (
            <>
              Pourquoi vous{" "}
              <span className="text-success">performez bien</span>
            </>
          ) : (
            <>
              Pourquoi vous êtes{" "}
              <span className="text-destructive">invisible</span>
            </>
          )}
        </h2>
      </div>

      <div className="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-3">
        {reasons.map((r, i) => {
          const SlotIcon = SLOT_ICONS[r.slot];
          return (
            <motion.div
              key={r.slot}
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
                  "h-full border-ankora-border transition-shadow",
                  "hover:shadow-md hover:-translate-y-0.5 transition-transform"
                )}
              >
                <CardContent className="pt-6 pb-6 space-y-4">
                  {/* Numero gradient + icone */}
                  <div className="flex items-center justify-between">
                    <span
                      aria-hidden="true"
                      className="font-display text-4xl sm:text-5xl font-bold leading-none bg-gradient-to-br from-ankora-text/30 to-ankora-text/10 bg-clip-text text-transparent"
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-xl ring-1",
                        accent.bg,
                        accent.text,
                        accent.ring
                      )}
                      aria-hidden="true"
                    >
                      <SlotIcon className="h-5 w-5" />
                    </span>
                  </div>

                  {/* Titre */}
                  <h3 className="font-display text-lg sm:text-xl font-semibold leading-tight text-ankora-text">
                    {r.title}
                  </h3>

                  {/* Sous-texte */}
                  <p className="text-sm sm:text-base text-ankora-text-soft leading-relaxed">
                    {r.subtitle}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Decoration discrete signalant le ton positif */}
      {isPositive ? (
        <p className="text-center text-sm text-ankora-text-muted flex items-center justify-center gap-2">
          <Sparkles className="h-4 w-4 text-success" aria-hidden="true" />
          Tous les indicateurs clés sont au vert.
        </p>
      ) : null}
    </section>
  );
}
