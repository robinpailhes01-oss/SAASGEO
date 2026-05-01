"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { HeroAuditForm } from "./HeroAuditForm";
import { cn } from "@/lib/utils";

// =====================================================================
// <FinalCta /> — encadre CTA final de la landing.
//
// Card pleine largeur avec gradient signature subtil indigo->fuchsia->
// rose, 2 halos blur decoratifs, badge eyebrow "Audit gratuit", titre
// accroche, sous-titre rassurant, formulaire d'audit integre.
//
// Anime au scroll : fade + scale 0.97->1 (impact subtil sans distraire
// du formulaire).
// =====================================================================

export function FinalCta() {
  const reduce = useReducedMotion();

  return (
    <section
      className="py-20 sm:py-28"
      aria-labelledby="final-cta-title"
    >
      <Container>
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.97, y: 8 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px -120px 0px" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "relative overflow-hidden rounded-3xl border border-primary/20",
            "bg-gradient-to-br from-primary/[0.10] via-fuchsia-500/[0.07] to-rose-500/[0.06]",
            "shadow-ankora-elevated"
          )}
        >
          {/* Halos decoratifs */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 -right-32 h-80 w-80 rounded-full bg-primary/20 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-32 -left-32 h-80 w-80 rounded-full bg-fuchsia-500/15 blur-3xl"
          />

          <div className="relative px-6 py-14 sm:px-12 sm:py-18 text-center">
            {/* Eyebrow */}
            <div className="flex justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-card/80 backdrop-blur-sm border border-ankora-border px-3 py-1 text-xs font-semibold uppercase tracking-wider text-ankora-text">
                <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                Audit gratuit
              </span>
            </div>

            {/* Titre */}
            <h2
              id="final-cta-title"
              className="mt-6 font-display text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-ankora-text max-w-3xl mx-auto leading-tight"
            >
              Prêt à voir ce que les IA disent{" "}
              <span className="text-ankora-gradient">vraiment</span> de vous ?
            </h2>

            {/* Sous-titre */}
            <p className="mt-5 text-base sm:text-lg text-ankora-text-soft max-w-2xl mx-auto">
              5 minutes, sans inscription, 100% gratuit.{" "}
              <span className="font-semibold text-ankora-text">
                Vous serez surpris.
              </span>
            </p>

            {/* Formulaire integre */}
            <div className="mt-10 max-w-xl mx-auto">
              <HeroAuditForm />
            </div>
          </div>
        </motion.div>
      </Container>
    </section>
  );
}
