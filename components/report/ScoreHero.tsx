"use client";

import * as React from "react";
import { motion } from "framer-motion";

import { CountUpNumber } from "./CountUpNumber";
import { scoreTone, type ProviderScore, type ScoreTone } from "@/lib/report/types";
import { cn } from "@/lib/utils";

// =====================================================================
// <ScoreHero /> — bloc 1 du rapport.
//
// V3 (refonte langage business) : la phrase "X clients sur 100 ne vous
// trouvent pas" devient le titre principal. Le score 0-100 reste affiche
// mais en SECONDAIRE (plus petit) pour les curieux qui veulent un
// indicateur synthetique.
//
// Pourquoi ? Nos clients sont des commercants locaux. Ils comprennent
// "67 clients perdus" mieux que "27/100". Le chiffre business prime.
//
// Calcul "X clients sur 100" :
//   - Si mention_rate disponible (% de queries ou la marque est citee
//     parmi 120 reponses), on l'utilise : missingPct = 100 - mention_rate.
//     Plus precis car reflete la VRAIE visibility.
//   - Sinon fallback sur global_score : missingPct = 100 - global_score.
//
// Couleurs des 4 mini-scores par IA inchangees (font mono, accent par
// provider). Count-up animation preservee, juste sur des chiffres
// differents (la phrase principale + le score secondaire).
// =====================================================================

type ScoreHeroProps = {
  globalScore: number;
  perProvider: ProviderScore[];
  // Optionnel : taux de mention reel (0-100). Si fourni, on l'utilise
  // pour calculer "X clients sur 100" (plus precis que global_score).
  mentionRate?: number | null;
};

const toneClass: Record<ScoreTone, string> = {
  low: "text-destructive",
  medium: "text-warning",
  high: "text-success",
};

const toneGlow: Record<ScoreTone, string> = {
  low: "drop-shadow-[0_0_24px_rgba(239,68,68,0.20)]",
  medium: "drop-shadow-[0_0_24px_rgba(245,158,11,0.20)]",
  high: "drop-shadow-[0_0_24px_rgba(16,185,129,0.20)]",
};

export function ScoreHero({
  globalScore,
  perProvider,
  mentionRate,
}: ScoreHeroProps) {
  const tone = scoreTone(globalScore);

  // Pourcentage "ne vous trouvent pas" : prefere mention_rate si dispo,
  // sinon retombe sur 100 - global_score. Clamp 0-100 par securite.
  const missingPct = (() => {
    if (typeof mentionRate === "number" && Number.isFinite(mentionRate)) {
      return Math.max(0, Math.min(100, Math.round(100 - mentionRate)));
    }
    return Math.max(0, Math.min(100, Math.round(100 - globalScore)));
  })();
  const findingPct = 100 - missingPct;
  // Tone du chiffre principal : on suit la meme logique que scoreTone
  // mais inversee — si BEAUCOUP de clients perdus, c'est rouge.
  const missingTone: ScoreTone =
    missingPct >= 60 ? "low" : missingPct >= 30 ? "medium" : "high";

  return (
    <section
      className="text-center"
      aria-labelledby="score-hero-label"
    >
      <p
        id="score-hero-label"
        className="text-xs sm:text-sm font-medium uppercase tracking-[0.2em] text-ankora-text-muted"
      >
        Votre visibilité IA
      </p>

      {/* Phrase business principale */}
      <h2 className="mt-5 max-w-3xl mx-auto font-display text-3xl sm:text-4xl md:text-5xl font-bold leading-[1.1] tracking-tight text-ankora-ink">
        <span
          className={cn(
            "font-display font-bold tabular-nums",
            toneClass[missingTone],
            toneGlow[missingTone]
          )}
        >
          <CountUpNumber
            to={missingPct}
            durationMs={1500}
            ariaLabel={`${missingPct} clients sur 100 ne vous trouvent pas`}
          />
        </span>{" "}
        clients sur 100 qui vous cherchent via une IA
        {" "}
        <span className={toneClass[missingTone]}>ne vous trouvent pas</span>.
      </h2>

      {/* Sous-ligne pedagogique : equilibre du chiffre */}
      <p className="mt-4 text-base sm:text-lg text-ankora-text-soft">
        Sur 100 personnes qui cherchent votre type d&apos;activité,{" "}
        <span className="font-semibold text-ankora-text">
          {findingPct} vous trouvent
        </span>{" "}
        et{" "}
        <span className="font-semibold text-ankora-text">
          {missingPct} vont chez un concurrent
        </span>
        .
      </p>

      {/* Score IA secondaire — pour les curieux. Plus petit qu'avant */}
      <div className="mt-8 inline-flex items-baseline gap-1.5 rounded-2xl border border-ankora-border bg-card/60 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ankora-text-muted">
          Score IA
        </span>
        <span
          className={cn(
            "font-display font-bold tabular-nums text-2xl sm:text-3xl",
            toneClass[tone]
          )}
        >
          <CountUpNumber to={globalScore} durationMs={1500} delayMs={300} />
        </span>
        <span className="font-display text-base text-ankora-text-muted">
          /100
        </span>
      </div>

      {/* Note explicative : le score est calcule SANS les questions
          branded (ou le nom de la marque est dans la question — un client
          qui cherche par votre nom vous trouve, c'est attendu, ca ne
          mesure pas la vraie visibilite commerciale). */}
      <p className="mt-3 max-w-xl mx-auto text-xs text-ankora-text-muted leading-snug">
        Calculé sur 20 questions service et comparatives — les requêtes
        où vos clients ne connaissent pas encore votre nom. Les
        10 questions de notoriété sont visibles dans le détail mais
        n&apos;impactent pas le score.
      </p>

      {/* Mini-scores par IA — inchanges, gardent leur role d'ancrage serieux */}
      <ul
        className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 max-w-2xl mx-auto"
        aria-label="Scores détaillés par IA"
      >
        {perProvider.map((p, i) => (
          <motion.li
            key={p.provider}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.6 + i * 0.1, ease: "easeOut" }}
            className="rounded-2xl border border-ankora-border bg-card p-4"
          >
            <p
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: p.color }}
            >
              {p.label}
            </p>
            <p className="mt-1 font-mono text-2xl sm:text-3xl font-bold tabular-nums text-ankora-text">
              <CountUpNumber to={p.score} durationMs={1200} delayMs={600 + i * 100} />
              <span className="text-base text-ankora-text-muted font-normal">
                /100
              </span>
            </p>
          </motion.li>
        ))}
      </ul>

      {/* Insight ligne : commentaire pedagogique sur l'asymetrie best/worst.
          Ne s'affiche que si l'ecart est significatif (>= 25 points) — sinon
          la presence sur les 4 IA est equilibree, pas besoin d'expliquer.
          Pour le claim de part de marche, on cite UNIQUEMENT ChatGPT (~60%
          des recherches IA en France). Source : combined GA4 + Statcounter
          referrer data, ordres de grandeur stables 2025-2026 (ChatGPT ~60%,
          Gemini ~22%, Claude ~8%, Perplexity ~8%). On evite l'amalgame
          ChatGPT+Claude qui suggererait que Claude pese autant que
          ChatGPT — c'est faux et ca decredibilise le rapport. */}
      {(() => {
        if (perProvider.length < 2) return null;
        const sorted = [...perProvider].sort((a, b) => b.score - a.score);
        const best = sorted[0];
        const worst = sorted[sorted.length - 1];
        if (best.score - worst.score < 25) return null;

        // Mention volume : seulement si ChatGPT (openai) est dans les
        // weak (<30). Claude / Gemini / Perplexity n'ont pas une part
        // de marche suffisamment massive pour ancrer un message
        // "concentre les recherches" credible.
        const chatGPTInWeak = sorted.find(
          (p) => p.score < 30 && p.provider === "openai"
        );

        return (
          <p className="mt-6 max-w-2xl mx-auto text-sm sm:text-base text-ankora-text-soft leading-relaxed text-center">
            Vous performez bien sur{" "}
            <span className="font-semibold" style={{ color: best.color }}>
              {best.label}
            </span>{" "}
            ({best.score}/100) mais êtes peu visible sur{" "}
            <span className="font-semibold" style={{ color: worst.color }}>
              {worst.label}
            </span>{" "}
            ({worst.score}/100)
            {chatGPTInWeak ? (
              <>
                .{" "}
                <span className="font-semibold text-ankora-text">
                  ChatGPT concentre ~60% des recherches IA en France
                </span>{" "}
                — c&apos;est là que vos clients cherchent en priorité
              </>
            ) : null}
            .
          </p>
        );
      })()}
    </section>
  );
}
