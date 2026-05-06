"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Swords, Eye, EyeOff, Check, Minus } from "lucide-react";

import type { KnownCompetitorMatchup } from "@/lib/report/types";
import { cn } from "@/lib/utils";

// =====================================================================
// <KnownCompetitorsPanel /> — bloc dedie aux concurrents saisis par
// le client au formulaire (audits.competitors).
//
// Pour chaque concurrent, on a injecte 2 queries comparatives ciblees
// dans le pipeline ("Alternatives a {C}" + "Que pensez-vous de {C}").
// Ce bloc montre, pour chacun :
//
//   1. L'IA connait-elle {C} ? (= a-t-elle cite son nom dans une de
//      ses reponses ?) -> signal "marche obscur" si NON pour tous.
//   2. La marque a-t-elle ete citee face a {C} ?
//
// Le verdict synthetique (outcome) est calcule cote serveur.
//
// Pourquoi ce bloc est cle dans le rapport :
// Il repond a la frustration recurrente des clients : "L'audit ne
// connait pas mes vrais concurrents locaux, juste les plateformes
// nationales." En testant explicitement les concurrents que LE CLIENT
// connait, on transforme l'audit "generique" en audit "terrain". Si
// les IA ignorent meme {C}, c'est un signal fort -> opportunite
// d'etre les premiers du marche dans les IA.
// =====================================================================

type KnownCompetitorsPanelProps = {
  matchups: KnownCompetitorMatchup[];
  brandName: string;
};

const OUTCOME_TONE: Record<
  KnownCompetitorMatchup["outcome"],
  { border: string; bg: string; chip: string; text: string; label: string; icon: React.ReactNode }
> = {
  ai_unknown: {
    border: "border-warning/30",
    bg: "bg-warning/5",
    chip: "bg-warning/15 text-warning",
    text: "text-warning",
    label: "Marché obscur",
    icon: <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />,
  },
  brand_wins: {
    border: "border-success/40",
    bg: "bg-success/5",
    chip: "bg-success/15 text-success",
    text: "text-success",
    label: "À votre avantage",
    icon: <Check className="h-3.5 w-3.5" aria-hidden="true" />,
  },
  competitor_wins: {
    border: "border-destructive/30",
    bg: "bg-destructive/5",
    chip: "bg-destructive/15 text-destructive",
    text: "text-destructive",
    label: "À leur avantage",
    icon: <Eye className="h-3.5 w-3.5" aria-hidden="true" />,
  },
  tie: {
    border: "border-ankora-border",
    bg: "bg-card",
    chip: "bg-ankora-text-muted/15 text-ankora-text-muted",
    text: "text-ankora-text-muted",
    label: "Match nul",
    icon: <Minus className="h-3.5 w-3.5" aria-hidden="true" />,
  },
};

function buildSentence(
  m: KnownCompetitorMatchup,
  brandName: string
): React.ReactNode {
  if (m.outcome === "ai_unknown") {
    return (
      <>
        Les IA <span className="font-semibold text-ankora-text">ne connaissent pas {m.name}</span>.
        C&apos;est une opportunité — vous pouvez être les premiers à occuper
        ce terrain.
      </>
    );
  }
  if (m.outcome === "brand_wins") {
    return (
      <>
        Quand on demande aux IA leur avis sur {m.name},{" "}
        <span className="font-semibold text-ankora-text">
          {brandName} apparaît
        </span>{" "}
        plus souvent que {m.name} ({m.brand_mentions} vs{" "}
        {m.competitor_mentions} sur {m.total_responses} réponses).
      </>
    );
  }
  if (m.outcome === "competitor_wins") {
    return (
      <>
        {m.name} est cité {m.competitor_mentions} fois sur{" "}
        {m.total_responses} réponses,{" "}
        <span className="font-semibold text-ankora-text">
          vous {m.brand_mentions === 0 ? "n'apparaissez pas" : `seulement ${m.brand_mentions} fois`}
        </span>
        . Les IA le positionnent comme référence dans son périmètre.
      </>
    );
  }
  return (
    <>
      Présence équilibrée — {m.name} et {brandName} sont cités à parts
      égales ({m.brand_mentions} contre {m.competitor_mentions}).
    </>
  );
}

export function KnownCompetitorsPanel({
  matchups,
  brandName,
}: KnownCompetitorsPanelProps) {
  const reduce = useReducedMotion();

  if (matchups.length === 0) return null;

  // Stat globale : combien des concurrents indiques sont meme connus
  // des IA. Si 0/N, message fort sur l'opportunite de marche.
  const knownCount = matchups.filter(
    (m) => m.outcome !== "ai_unknown"
  ).length;
  const allUnknown = knownCount === 0;

  return (
    <section
      className="space-y-5"
      aria-labelledby="known-competitors-label"
    >
      <div className="text-center">
        <p
          id="known-competitors-label"
          className="text-xs sm:text-sm font-medium uppercase tracking-[0.2em] text-ankora-text-muted"
        >
          Vos concurrents face aux IA
        </p>
        <h3 className="mt-2 font-display text-2xl sm:text-3xl font-bold text-ankora-text">
          {allUnknown ? (
            <>Les IA ne connaissent <span className="text-warning">aucun</span> de vos concurrents</>
          ) : (
            <>
              Les IA connaissent{" "}
              <span className="text-ankora-text">
                {knownCount}/{matchups.length}
              </span>{" "}
              de vos concurrents
            </>
          )}
        </h3>
        <p className="mt-2 text-base text-ankora-text-soft max-w-2xl mx-auto">
          On a explicitement demandé aux 4 IA leur avis sur les
          concurrents que vous nous avez indiqués. Voici comment elles
          vous positionnent face à eux.
        </p>
      </div>

      <ul className="space-y-3">
        {matchups.map((m, i) => {
          const tone = OUTCOME_TONE[m.outcome];
          return (
            <motion.li
              key={`known-${m.name}-${i}`}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px -80px 0px" }}
              transition={{
                duration: 0.5,
                delay: i * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
              className={cn(
                "rounded-2xl border p-4 sm:p-5",
                tone.border,
                tone.bg
              )}
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:gap-5">
                <div className="flex items-start gap-3 sm:flex-1 min-w-0">
                  <span
                    className={cn(
                      "mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                      tone.chip
                    )}
                    aria-hidden="true"
                  >
                    <Swords className="h-4 w-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-lg sm:text-xl font-bold text-ankora-text truncate">
                        {m.name}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
                          tone.chip
                        )}
                      >
                        {tone.icon}
                        {tone.label}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm sm:text-base text-ankora-text-soft leading-relaxed">
                      {buildSentence(m, brandName)}
                    </p>
                  </div>
                </div>

                {/* Compteurs vs marque */}
                <div className="mt-3 sm:mt-0 sm:ml-4 sm:shrink-0 flex sm:flex-col items-center sm:items-end gap-3 sm:gap-1 text-xs">
                  <div className="font-mono tabular-nums text-ankora-text-muted">
                    <span className="font-semibold text-ankora-text">
                      {m.brand_mentions}
                    </span>{" "}
                    {brandName} vs{" "}
                    <span className="font-semibold text-ankora-text">
                      {m.competitor_mentions}
                    </span>{" "}
                    {m.name}
                  </div>
                  <div className="text-ankora-text-muted">
                    sur {m.total_responses} réponses IA
                  </div>
                </div>
              </div>
            </motion.li>
          );
        })}
      </ul>

      <p className="text-center text-xs text-ankora-text-muted">
        2 questions ciblées par concurrent x 4 IA x multi-pass (3
        exécutions par question pour stabiliser la mesure) = jusqu&apos;à
        24 réponses analysées par concurrent.
      </p>
    </section>
  );
}
