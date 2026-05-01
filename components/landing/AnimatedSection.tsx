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
    viewport: { once: true, amount: 0.2 },
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
