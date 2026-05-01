"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Calendar, Check, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { scoreTone } from "@/lib/report/types";
import { cn } from "@/lib/utils";

// =====================================================================
// <MainCta /> — bloc 9 : LE CTA principal du rapport.
//
// Card pleine largeur, fond gradient subtil indigo->violet->rose,
// ombre prononcee. 3 bullet-points value-props, bouton gradient size xl,
// micro-pulse permanente sur le bouton pour attirer l'oeil sans gener.
//
// Comportement Calendly :
//   - Si NEXT_PUBLIC_CALENDLY_URL est defini : ouvre Calendly dans un
//     nouvel onglet (target="_blank" rel="noopener noreferrer").
//   - Sinon : fallback mailto:contact@robinpailhes.fr avec subject +
//     body pre-remplis (URL auditee + score) pour faciliter le suivi
//     sans abandonner le prospect.
//
// Wording adaptatif selon le ton du score :
//   - low    : "Récupérez votre place dans les IA"
//   - medium : "Distancez vos concurrents dans les IA"
//   - high   : "Maintenez votre avance dans les IA"
// =====================================================================

type MainCtaProps = {
  globalScore: number;
  brandName: string;
  hostname: string;
};

const FALLBACK_EMAIL = "contact@robinpailhes.fr";

function buildMailtoUrl(args: {
  hostname: string;
  brandName: string;
  globalScore: number;
}): string {
  const subject = `Demande de consultation Ankora — Audit ${args.hostname}`;
  const body = [
    `Bonjour Robin,`,
    ``,
    `Je viens de réaliser l'audit Ankora pour ${args.brandName} (${args.hostname}).`,
    `Score obtenu : ${Math.round(args.globalScore)}/100.`,
    ``,
    `Je souhaite réserver 30 minutes pour échanger sur le plan d'action.`,
    ``,
    `Mes disponibilités :`,
    `- `,
    `- `,
    ``,
    `Merci !`,
  ].join("\n");
  const params = new URLSearchParams({ subject, body });
  return `mailto:${FALLBACK_EMAIL}?${params.toString()}`;
}

export function MainCta({ globalScore, brandName, hostname }: MainCtaProps) {
  const reduce = useReducedMotion();
  const tone = scoreTone(globalScore);

  const calendlyUrl = process.env.NEXT_PUBLIC_CALENDLY_URL;
  const ctaHref =
    calendlyUrl && calendlyUrl.length > 0
      ? calendlyUrl
      : buildMailtoUrl({ hostname, brandName, globalScore });
  const isCalendly = ctaHref.startsWith("http");

  const headline =
    tone === "low"
      ? "Récupérez votre place dans les IA"
      : tone === "medium"
      ? "Distancez vos concurrents dans les IA"
      : "Maintenez votre avance dans les IA";

  const bullets = [
    "Le plan d'action complet pour atteindre 70/100 en 60 jours",
    "La stratégie adaptée à votre budget",
    "Les outils concrets à mettre en place dès la semaine prochaine",
  ];

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, scale: 0.97, y: 8 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -100px 0px" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      aria-labelledby="main-cta-title"
    >
      <Card
        className={cn(
          "relative overflow-hidden border border-primary/20",
          "shadow-ankora-elevated",
          // Gradient signature subtil sur le fond
          "bg-gradient-to-br from-primary/[0.08] via-fuchsia-500/[0.06] to-rose-500/[0.05]"
        )}
      >
        {/* Halo decoratif */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-3xl"
        />

        <CardContent className="relative pt-10 pb-10 px-6 sm:px-10 text-center">
          {/* Eyebrow icon */}
          <div className="flex justify-center mb-4">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ankora-gradient text-white shadow-ankora-card"
              aria-hidden="true"
            >
              <Sparkles className="h-5 w-5" />
            </span>
          </div>

          {/* Titre */}
          <h2
            id="main-cta-title"
            className="font-display text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-ankora-text"
          >
            {headline}
          </h2>

          {/* Sous-titre */}
          <p className="mt-4 text-base sm:text-lg text-ankora-text-soft max-w-2xl mx-auto">
            Réservez 30 minutes gratuites avec Robin pour découvrir :
          </p>

          {/* Bullet points */}
          <ul className="mt-6 space-y-2.5 max-w-xl mx-auto text-left">
            {bullets.map((b) => (
              <li
                key={b}
                className="flex items-start gap-3 text-base text-ankora-text"
              >
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
                  aria-hidden="true"
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
                <span>{b}</span>
              </li>
            ))}
          </ul>

          {/* CTA bouton — micro-pulse subtil */}
          <motion.div
            className="mt-8 inline-block"
            animate={
              reduce
                ? undefined
                : {
                    scale: [1, 1.02, 1],
                  }
            }
            transition={
              reduce
                ? undefined
                : {
                    duration: 2.4,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }
            }
          >
            <Button
              asChild
              variant="gradient"
              size="lg"
              className="px-8 py-6 text-base sm:text-lg h-auto"
            >
              <a
                href={ctaHref}
                target={isCalendly ? "_blank" : undefined}
                rel={isCalendly ? "noopener noreferrer" : undefined}
              >
                <Calendar className="mr-2 h-5 w-5" aria-hidden="true" />
                Réserver mon créneau
                <span aria-hidden="true" className="ml-1">
                  →
                </span>
              </a>
            </Button>
          </motion.div>

          <p className="mt-4 text-sm text-ankora-text-muted">
            Disponibilités cette semaine
          </p>
        </CardContent>
      </Card>
    </motion.section>
  );
}
