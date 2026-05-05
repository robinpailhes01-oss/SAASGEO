"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { cn } from "@/lib/utils";
import { FAQ_ITEMS, type FAQItem } from "./faq-items";

// =====================================================================
// <FAQ /> — section FAQ visible (rendu UI uniquement).
//
// Les donnees vivent dans ./faq-items.ts (server-friendly) pour pouvoir
// etre importees AUSSI par app/page.tsx pour generer le JSON-LD
// FAQPage. Single source of verite : si on edite la-bas, l'UI ET le
// schema restent sync.
//
// Format BLUF (Bottom Line Up Front) : reponses 40-60 mots maximum,
// directes, sans intro/conclusion. C'est ce que les IA recommandent
// pour etre cite (elles preferent les reponses concises et factuelles).
//
// Implementation accessible : <details>/<summary> natifs HTML, zero
// dependance accordion.
// =====================================================================

// Re-export pour les anciens callers (faq-items.ts est la source).
export { FAQ_ITEMS } from "./faq-items";
export type { FAQItem } from "./faq-items";

// Element accordeon natif anime
function FAQRow({
  item,
  index,
}: {
  item: FAQItem;
  index: number;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = React.useState(false);

  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -100px 0px" }}
      transition={{
        duration: 0.4,
        delay: index * 0.05,
        ease: "easeOut",
      }}
      className="border-b border-ankora-border last:border-b-0"
    >
      <details
        className="group"
        onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary
          className={cn(
            "flex items-center justify-between gap-4 py-5 sm:py-6 cursor-pointer list-none",
            "[&::-webkit-details-marker]:hidden",
            "hover:text-ankora-text transition-colors"
          )}
        >
          <span className="font-display text-base sm:text-lg font-semibold text-ankora-text leading-snug">
            {item.question}
          </span>
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              "bg-secondary/60 transition-transform duration-300",
              open && "rotate-180 bg-primary/15 text-primary"
            )}
            aria-hidden="true"
          >
            <ChevronDown className="h-4 w-4" />
          </span>
        </summary>
        <div className="pb-5 sm:pb-6 -mt-1 max-w-3xl">
          <p className="text-sm sm:text-base text-ankora-text-soft leading-relaxed">
            {item.answer}
          </p>
        </div>
      </details>
    </motion.li>
  );
}

export function FAQ() {
  return (
    <section
      id="faq"
      className="py-16 sm:py-24"
      aria-labelledby="faq-title"
    >
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs sm:text-sm font-medium uppercase tracking-[0.2em] text-ankora-text-muted">
            Questions fréquentes
          </p>
          <h2
            id="faq-title"
            className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-tight text-ankora-text"
          >
            Tout ce que vous voulez savoir sur la visibilité IA
          </h2>
        </div>

        <ul className="mt-10 max-w-3xl mx-auto rounded-3xl border border-ankora-border bg-card divide-y divide-ankora-border overflow-hidden">
          {FAQ_ITEMS.map((item, i) => (
            <FAQRow key={item.question} item={item} index={i} />
          ))}
        </ul>

        <p className="mt-8 text-center text-sm text-ankora-text-muted">
          Une autre question ?{" "}
          <a
            href="mailto:contact@robinpailhes.fr"
            className="text-primary font-medium hover:underline"
          >
            Écrivez-nous
          </a>
          .
        </p>
      </Container>
    </section>
  );
}
