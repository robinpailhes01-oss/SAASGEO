"use client";

import * as React from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";

import { cn } from "@/lib/utils";

// =====================================================================
// <AnimatedSection /> — wrapper Framer Motion pour fade-in + slide-up
// au scroll. Subtil par design (12px de translation, 0.6s, easeOut).
//
// Respecte automatiquement `prefers-reduced-motion` : aucun mouvement
// si l'utilisateur a desactive les animations dans son OS.
//
// Prop `delay` permet de stagger des elements voisins (ex: 3 cards
// d'une meme section).
//
// Note typage : framer-motion remappe certains events (onDrag etc.)
// pour ses gestures, ce qui entre en conflit avec React.HTMLAttributes.
// On utilise donc HTMLMotionProps<"div"> comme base et on rend l'element
// reel via un switch `as`. Au runtime les trois balises acceptent les
// memes props DOM, c'est sans risque.
//
// IMPORTANT trigger viewport :
//   On utilise `margin` (pixels absolus) plutot que `amount` (ratio)
//   pour declencher l'animation. Raison : iOS Safari calcule mal les
//   ratios IntersectionObserver pour les sections >= 100vh — avec
//   amount: 0.2 sur une section de 1000px, il faut scroller jusqu'a
//   200px de profondeur, ce qui rate des sections entieres sur iPad.
//   `margin: "0px 0px -120px 0px"` signifie "declenche quand le top
//   de la section est a -120px du bas du viewport" — i.e. des qu'elle
//   commence a apparaitre. Comportement deterministe sur toutes les
//   plateformes.
// =====================================================================

type AnimatedTag = "section" | "div" | "article";

type AnimatedSectionProps = Omit<HTMLMotionProps<"div">, "ref"> & {
  delay?: number;
  as?: AnimatedTag;
};

export function AnimatedSection({
  className,
  delay = 0,
  as = "section",
  children,
  ...rest
}: AnimatedSectionProps) {
  const reduce = useReducedMotion();

  const initial = reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 };
  const animateInView = { opacity: 1, y: 0 };

  const motionProps = {
    initial,
    whileInView: animateInView,
    viewport: { once: true, margin: "0px 0px -120px 0px" },
    transition: { duration: 0.6, ease: "easeOut", delay },
    className: cn(className),
    ...rest,
  };

  if (as === "article") {
    return (
      <motion.article {...(motionProps as HTMLMotionProps<"article">)}>
        {children}
      </motion.article>
    );
  }
  if (as === "div") {
    return (
      <motion.div {...(motionProps as HTMLMotionProps<"div">)}>
        {children}
      </motion.div>
    );
  }
  return (
    <motion.section {...(motionProps as HTMLMotionProps<"section">)}>
      {children}
    </motion.section>
  );
}
