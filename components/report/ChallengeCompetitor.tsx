"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Target, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// =====================================================================
// <ChallengeCompetitor /> — bloc 10 : viralite legere.
//
// Encadre secondaire, plus discret que le CTA principal. Invite a
// auditer un concurrent (notamment celui du top 3 affiche plus haut).
// Lien retour vers la landing — le prefill du formulaire avec le nom
// du concurrent demanderait de toucher HeroAuditForm pour lire un
// query param (?url=...) ; pour le MVP D.4 on garde un lien simple.
// =====================================================================

type ChallengeCompetitorProps = {
  topCompetitorName?: string | null;
};

export function ChallengeCompetitor({
  topCompetitorName,
}: ChallengeCompetitorProps) {
  const reduce = useReducedMotion();

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -100px 0px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      aria-labelledby="challenge-title"
    >
      <Card className="border-ankora-border bg-secondary/40">
        <CardContent className="pt-6 pb-6 px-6 sm:px-8 flex flex-col sm:flex-row items-center gap-4 sm:gap-6 text-center sm:text-left">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <Target className="h-5 w-5" />
          </span>
          <div className="flex-1 min-w-0">
            <h3
              id="challenge-title"
              className="font-display text-lg sm:text-xl font-semibold text-ankora-text"
            >
              Curieux du score{" "}
              {topCompetitorName ? (
                <>
                  de{" "}
                  <span className="text-primary">{topCompetitorName}</span> ?
                </>
              ) : (
                <>de vos concurrents ?</>
              )}
            </h3>
            <p className="mt-1 text-sm text-ankora-text-soft">
              Lancez un audit gratuit sur n&apos;importe quel site en 30
              secondes.
            </p>
          </div>
          <Button asChild variant="outline" size="default" className="shrink-0">
            <Link href="/">
              Auditer un autre site
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </motion.section>
  );
}
