"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Lightbulb } from "lucide-react";

// =====================================================================
// <EngagementTip /> — message rotatif pendant l'attente.
//
// Garde le prospect engage pendant les 3-4 minutes du pipeline en
// faisant defiler des tips chiffres (anecdotes produit + chiffres
// marche). Rotation 8s : suffisamment lent pour lire, suffisamment
// rapide pour signaler "ca tourne, on est connecte".
//
// Tous les chiffres cites sont sources internes (mecaniques Ankora :
// 51 criteres, 30 questions...) ou marche (1.2% commerces locaux,
// Foursquare 49%) — coherent avec la regle "jamais de chiffre
// fantaisiste" appliquee partout dans le rapport.
// =====================================================================

const TIPS: string[] = [
  // Tips brief (priorite editoriale forte — mises en avant)
  "Une page « À propos » détaillée multiplie par 2 vos chances d'être citée.",
  "Foursquare alimente 49 % des résultats locaux de ChatGPT — la plupart des commerces l'ignorent.",
  "Les IA retournent 3 à 5 résultats maximum. Soit vous en faites partie, soit vous n'existez pas.",
  "Perplexity crawle le web en temps réel — vos actions GEO peuvent être visibles en 24 h.",
  "1,2 % seulement des commerces locaux sont cités par les IA. Ankora mesure où vous en êtes.",
  // Tips internes (mecaniques Ankora)
  "Notre audit vérifie 51 critères techniques sur votre site.",
  "Chaque IA est interrogée 30 fois avec des questions clients réalistes.",
  "ChatGPT recommande en moyenne 3 marques par requête commerciale.",
];

const ROTATION_MS = 8_000;

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
