"use client";

import * as React from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  useReducedMotion,
} from "framer-motion";

// =====================================================================
// <CountUpNumber /> — animation de compteur Framer Motion.
//
// Anime un nombre de `from` (par defaut 0) vers `to` sur `durationMs`
// avec un easing easeOutCubic. Respecte prefers-reduced-motion :
// affiche la valeur finale sans animation pour les utilisateurs
// concernes.
//
// Le composant rend une string formatee (Math.round par defaut), ce
// qui le rend reutilisable pour scores, pourcentages et compteurs
// generiques.
// =====================================================================

type CountUpNumberProps = {
  to: number;
  from?: number;
  durationMs?: number;
  // Permet de personnaliser le rendu (ex: pourcentage, virgule fr-FR)
  format?: (value: number) => string;
  // Delai avant le demarrage de l'animation (utile pour stagger)
  delayMs?: number;
  className?: string;
  // ARIA : valeur lue par le screen reader (texte final)
  ariaLabel?: string;
};

const defaultFormat = (v: number) => Math.round(v).toString();

export function CountUpNumber({
  to,
  from = 0,
  durationMs = 1500,
  format = defaultFormat,
  delayMs = 0,
  className,
  ariaLabel,
}: CountUpNumberProps) {
  const reduce = useReducedMotion();
  const value = useMotionValue(reduce ? to : from);
  const display = useTransform(value, (v) => format(v));

  React.useEffect(() => {
    if (reduce) {
      value.set(to);
      return;
    }
    const controls = animate(value, to, {
      duration: durationMs / 1000,
      delay: delayMs / 1000,
      // easeOutCubic : demarre rapidement, finit en douceur
      ease: [0.33, 1, 0.68, 1],
    });
    return () => controls.stop();
  }, [to, durationMs, delayMs, reduce, value]);

  return (
    <motion.span
      className={className}
      aria-label={ariaLabel ?? format(to)}
      role="text"
    >
      {display}
    </motion.span>
  );
}
