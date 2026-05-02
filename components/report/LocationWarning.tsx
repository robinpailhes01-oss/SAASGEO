"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { MapPin, AlertTriangle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// =====================================================================
// <LocationWarning /> — bandeau visible en haut du rapport.
//
// Affichage conditionnel UNIQUEMENT dans le cas suivant :
//   business_scope === 'local'  &&  city/region/geo_zone tous absents
//
// Dans cet unique cas, le rapport est degrade (questions generees sans
// ancrage local) et on demande explicitement a l'utilisateur de
// relancer un audit en saisissant sa ville. CTA pleine largeur vers
// /#audit pour faciliter le re-submit.
//
// Tous les autres cas (city presente, scope national, scope
// international) ne declenchent pas ce bandeau — le badge subtil
// dans <AIResponsePreview /> suffit pour la pedagogie contextuelle.
// =====================================================================

type LocationWarningProps = {
  // Conditions actuelles. Si toutes ces conditions sont reunies, on
  // affiche le bandeau ; sinon le composant rend null.
  scope: "local" | "national" | "international";
  city: string | null;
  region: string | null;
};

export function LocationWarning({ scope, city, region }: LocationWarningProps) {
  const reduce = useReducedMotion();

  const shouldShow = scope === "local" && !city && !region;
  if (!shouldShow) return null;

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      aria-labelledby="location-warning-title"
    >
      <Card className="border-2 border-warning/40 bg-warning/5">
        <CardContent className="pt-5 pb-5 px-5 sm:px-7 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-warning/15 text-warning"
            aria-hidden="true"
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="flex-1 min-w-0">
            <p
              id="location-warning-title"
              className="text-xs font-semibold uppercase tracking-wider text-warning"
            >
              Localisation non détectée
            </p>
            <p className="mt-1 text-sm sm:text-base text-ankora-text leading-snug">
              Votre activité semble locale, mais nous n&apos;avons pas pu
              identifier votre ville. Les questions générées sont moins
              pertinentes pour votre marché.{" "}
              <span className="font-semibold">
                Relancez l&apos;audit en saisissant votre ville
              </span>{" "}
              pour des résultats fiables.
            </p>
          </div>
          <Button asChild variant="outline" size="default" className="shrink-0">
            <Link href="/#audit">
              <MapPin className="mr-2 h-4 w-4" aria-hidden="true" />
              Relancer avec ma ville
            </Link>
          </Button>
        </CardContent>
      </Card>
    </motion.section>
  );
}
