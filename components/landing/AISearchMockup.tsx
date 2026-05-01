"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkles, X } from "lucide-react";

import { cn } from "@/lib/utils";

// =====================================================================
// <AISearchMockup /> — faux screenshot d'une conversation IA.
//
// Stylise comme une interface ChatGPT-like : header brand-colore,
// bulle question utilisateur, reponse assistant avec liste de 3
// "Marque A/B/C" generiques (pas de vrais noms inventes pour rester
// honnete). Question universelle qui marche pour tout secteur.
// Overlay rotate ~6deg en bas-droite : "Votre marque n'apparait pas"
// pour creer le declic emotionnel.
//
// Tout en CSS pur (pas d'image). Animation : leger fade + scale au
// scroll. Design coherent avec le rapport Ankora (rounded-2xl, font
// display/sans/mono).
// =====================================================================

type AISearchMockupProps = {
  className?: string;
};

const FAKE_RESULTS = [
  { name: "Marque A", segment: "Leader du marché", rating: "4.8" },
  { name: "Marque B", segment: "Leader du marché", rating: "4.6" },
  { name: "Marque C", segment: "Leader du marché", rating: "4.5" },
] as const;

export function AISearchMockup({ className }: AISearchMockupProps) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "0px 0px -120px 0px" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className={cn("relative w-full max-w-md mx-auto", className)}
      aria-hidden="true"
    >
      {/* Halo decoratif */}
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-emerald-200/30 via-primary/15 to-fuchsia-300/20 blur-2xl opacity-60" />

      {/* Card chat */}
      <div className="rounded-3xl border border-ankora-border bg-card shadow-ankora-elevated overflow-hidden">
        {/* Header style ChatGPT */}
        <div className="flex items-center justify-between border-b border-ankora-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-white text-xs font-bold"
              style={{ backgroundColor: "#10A37F" }}
            >
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="font-display text-sm font-semibold text-ankora-text">
              ChatGPT
            </span>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider text-ankora-text-muted">
            il y a 2&nbsp;sec
          </span>
        </div>

        {/* Question utilisateur */}
        <div className="px-4 pt-4">
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-secondary/70 px-3.5 py-2.5">
            <p className="text-sm text-ankora-text leading-snug">
              Quelles sont les meilleures marques de mon secteur ?
            </p>
          </div>
        </div>

        {/* Reponse IA */}
        <div className="px-4 pt-3 pb-4">
          <div className="mr-auto max-w-[92%] rounded-2xl rounded-tl-sm bg-primary/[0.06] border border-primary/10 px-3.5 py-3">
            <p className="text-xs text-ankora-text-soft leading-relaxed">
              Voici les marques les plus reconnues du secteur :
            </p>
            <ul className="mt-2 space-y-1.5">
              {FAKE_RESULTS.map((r, i) => (
                <li
                  key={r.name}
                  className="flex items-start gap-2 text-xs text-ankora-text"
                >
                  <span className="mt-0.5 font-mono font-bold text-primary tabular-nums shrink-0">
                    {i + 1}.
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="font-semibold">{r.name}</span>
                    <span className="text-ankora-text-muted">
                      {" "}
                      — {r.segment} · {r.rating}/5
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Overlay rouge : marque absente — rotation subtile pour effet sticker */}
      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 0.85, rotate: -6 }}
        whileInView={{ opacity: 1, scale: 1, rotate: -6 }}
        viewport={{ once: true, margin: "0px 0px -120px 0px" }}
        transition={{
          duration: 0.5,
          delay: 0.4,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="absolute -bottom-4 -right-3 sm:-bottom-5 sm:-right-5"
      >
        <div className="flex items-center gap-2 rounded-2xl border-2 border-destructive/30 bg-destructive/10 backdrop-blur-sm px-3.5 py-2 shadow-ankora-card">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/20 text-destructive">
            <X className="h-4 w-4" strokeWidth={3} />
          </span>
          <p className="text-xs sm:text-sm font-semibold text-destructive leading-tight">
            Votre marque
            <br />
            n&apos;apparaît pas
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
