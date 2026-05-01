"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Lightbulb } from "lucide-react";

// =====================================================================
// <EngagementTip /> — message rotatif pendant l'attente.
//
// Brief Bloc 5 : "Bonus apprécié — petit message qui change toutes
// les 30s pendant l'attente". Garde le prospect engagé.
//
// Tips choisis pour entretenir la curiosité (chiffres, anecdotes
// produit) sans verser dans le commercial agressif.
// =====================================================================

const TIPS: string[] = [
  "70% des Français utiliseront une IA pour leurs achats en 2026.",
  "Notre audit vérifie 51 critères techniques GEO sur votre site.",
  "Chaque IA est interrogée 30 fois avec des questions clients réalistes.",
  "ChatGPT recommande en moyenne 3 marques par requête commerciale.",
  "Une page « À propos » détaillée multiplie par 2 vos chances d'être citée.",
  "Les IA conversationnelles préfèrent les sites avec un sitemap.xml clair.",
];

const ROTATION_MS = 30_000;

export function EngagementTip() {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % TIPS.length);
    }, ROTATION_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className="rounded-2xl border border-ankora-border bg-secondary/40 p-4 sm:p-5"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <Lightbulb
          className="h-5 w-5 shrink-0 text-primary"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-ankora-text-muted">
            Le saviez-vous ?
          </p>
          <AnimatePresence mode="wait">
            <motion.p
              key={index}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="mt-1 text-sm sm:text-base text-ankora-text leading-relaxed"
            >
              {TIPS[index]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
