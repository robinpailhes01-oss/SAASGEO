"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight, Sparkles } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  PROVIDER_LABELS,
  PROVIDER_COLORS,
  PROVIDER_ORDER,
  type AIProvider,
  type EvolutionPayload,
} from "@/lib/report/types";

// =====================================================================
// <EvolutionPanel /> — bloc bonus de fin de rapport.
//
// Affiche :
//   1) Presence par categorie (3 barres) — TOUJOURS visible
//   2) Si snapshot precedent disponible : deltas IA + queries
//      gagnees/perdues + delta global
//   3) Sinon : message baseline "Premier audit pour ce site, vos
//      prochaines evolutions apparaitront ici a partir du 2e audit"
//
// IMPORTANT : aucune metrique inventee/volume estime. Uniquement ce
// qu'on a mesure reellement.
//
// Position dans la page rapport : entre ManualQueries et MainCta.
// =====================================================================

type EvolutionPanelProps = {
  data: EvolutionPayload;
};

const CATEGORY_LABELS: Record<"branded" | "service" | "comparative", string> = {
  branded: "Marque",
  service: "Sectoriel",
  comparative: "Comparatif",
};

const CATEGORY_COLORS: Record<"branded" | "service" | "comparative", string> = {
  branded: "bg-primary/80",
  service: "bg-fuchsia-500/80",
  comparative: "bg-rose-500/80",
};

// Format date FR courte : "il y a X jours"
function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} jours`;
  if (days < 31) return `il y a ${Math.floor(days / 7)} sem`;
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`;
  return `il y a ${Math.floor(days / 365)} an${Math.floor(days / 365) > 1 ? "s" : ""}`;
}

// Helper : composant petit badge delta avec fleche directionnelle
function DeltaBadge({ value, suffix = "" }: { value: number; suffix?: string }) {
  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-ankora-text-muted text-xs font-mono">
        <Minus className="h-3 w-3" aria-hidden="true" />
        0{suffix}
      </span>
    );
  }
  const positive = value > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-mono font-semibold tabular-nums",
        positive ? "text-success" : "text-destructive"
      )}
      aria-label={`Évolution : ${positive ? "plus" : "moins"} ${Math.abs(value)}${suffix}`}
    >
      {positive ? (
        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
      ) : (
        <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
      )}
      {positive ? "+" : ""}
      {value}
      {suffix}
    </span>
  );
}

export function EvolutionPanel({ data }: EvolutionPanelProps) {
  const reduce = useReducedMotion();
  const { presence_per_category: presence, previous, delta } = data;
  const totalPresence =
    presence.branded + presence.service + presence.comparative;

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -100px 0px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      aria-labelledby="evolution-title"
      className="space-y-6"
    >
      <div className="text-center">
        <p className="text-xs sm:text-sm font-medium uppercase tracking-[0.2em] text-ankora-text-muted">
          Évolution
        </p>
        <h2
          id="evolution-title"
          className="mt-3 font-display text-2xl sm:text-3xl font-bold tracking-tight text-ankora-text"
        >
          Votre présence mesurée
        </h2>
        {previous ? (
          <p className="mt-2 text-sm text-ankora-text-soft">
            Comparé à votre audit précédent ({relativeDate(previous.computed_at)}).
          </p>
        ) : (
          <p className="mt-2 text-sm text-ankora-text-soft">
            Premier audit pour ce site — vos prochaines évolutions
            apparaîtront ici dès le prochain audit.
          </p>
        )}
      </div>

      {/* === Bloc 1 : Présence par catégorie (3 barres) === */}
      <Card className="border-ankora-border">
        <CardContent className="pt-6 pb-6 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm font-semibold text-ankora-text">
              Sur les{" "}
              <span className="font-mono font-bold tabular-nums">
                {totalPresence}
              </span>{" "}
              questions sur 30 où vous apparaissez
            </p>
            {delta && delta.mention_rate !== null ? (
              <DeltaBadge value={Math.round(delta.mention_rate)} suffix=" %" />
            ) : null}
          </div>

          {/* 3 barres horizontales */}
          <div className="space-y-3">
            {(
              ["branded", "service", "comparative"] as const
            ).map((cat) => {
              const value = presence[cat];
              const widthPct = (value / 10) * 100;
              const deltaValue = delta ? delta[`presence_${cat}` as
                | "presence_branded"
                | "presence_service"
                | "presence_comparative"] : null;
              return (
                <div key={cat} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-ankora-text">
                      {CATEGORY_LABELS[cat]}
                    </span>
                    <span className="font-mono tabular-nums text-ankora-text-soft inline-flex items-center gap-2">
                      <span>
                        <span className="font-bold text-ankora-text">
                          {value}
                        </span>
                        <span className="text-xs text-ankora-text-muted">
                          {" "}
                          / 10
                        </span>
                      </span>
                      {deltaValue !== null && deltaValue !== undefined ? (
                        <DeltaBadge value={deltaValue} />
                      ) : null}
                    </span>
                  </div>
                  <div
                    className="h-2 w-full rounded-full bg-secondary/60 overflow-hidden"
                    role="progressbar"
                    aria-valuenow={value}
                    aria-valuemin={0}
                    aria-valuemax={10}
                  >
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-700 ease-out",
                        CATEGORY_COLORS[cat]
                      )}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* === Bloc 2 : Présence par IA (toujours affiché, deltas si previous) === */}
      <Card className="border-ankora-border">
        <CardContent className="pt-6 pb-6">
          <p className="text-sm font-semibold text-ankora-text mb-4">
            Présence par IA
          </p>
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PROVIDER_ORDER.map((p: AIProvider) => {
              const currentScore = previous?.scores_per_provider[p];
              // On affiche le delta seulement si on a un previous;
              // le score courant est deja dans la prop ScoreHero, ici on
              // affiche le DELTA principalement.
              const deltaValue = delta?.scores_per_provider[p];
              return (
                <li
                  key={p}
                  className="rounded-xl border border-ankora-border bg-card p-3 text-center"
                >
                  <p
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: PROVIDER_COLORS[p] }}
                  >
                    {PROVIDER_LABELS[p]}
                  </p>
                  {deltaValue !== undefined && deltaValue !== null ? (
                    <p className="mt-1.5 inline-flex items-center justify-center gap-1.5">
                      <DeltaBadge value={deltaValue} />
                    </p>
                  ) : (
                    <p className="mt-1.5 text-xs text-ankora-text-muted">
                      {currentScore !== undefined
                        ? `${currentScore}/100 avant`
                        : "—"}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {!previous ? (
            <p className="mt-4 text-xs text-ankora-text-muted text-center">
              Les évolutions par IA apparaîtront ici à partir du 2e audit.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* === Bloc 3 : Queries gagnées / perdues === */}
      {delta && (delta.queries_gained || delta.queries_lost) ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Gagnées */}
          <Card className="border-success/30 bg-success/5">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-success/15 text-success">
                  <TrendingUp className="h-4 w-4" aria-hidden="true" />
                </span>
                <p className="text-sm font-semibold text-ankora-text">
                  Requêtes gagnées (
                  <span className="font-mono">
                    {delta.queries_gained?.length ?? 0}
                  </span>
                  )
                </p>
              </div>
              {delta.queries_gained && delta.queries_gained.length > 0 ? (
                <ul className="space-y-1.5 text-sm text-ankora-text">
                  {delta.queries_gained.slice(0, 5).map((q) => (
                    <li
                      key={q}
                      className="flex items-start gap-2 leading-snug"
                    >
                      <span className="text-success shrink-0">+</span>
                      <span className="first-letter:uppercase">{q}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ankora-text-muted">
                  Aucune nouvelle requête captée depuis le dernier audit.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Perdues */}
          <Card
            className={cn(
              "border",
              (delta.queries_lost?.length ?? 0) > 0
                ? "border-warning/40 bg-warning/5"
                : "border-ankora-border"
            )}
          >
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-2 mb-3">
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-lg",
                    (delta.queries_lost?.length ?? 0) > 0
                      ? "bg-warning/15 text-warning"
                      : "bg-secondary/60 text-ankora-text-muted"
                  )}
                >
                  <TrendingDown className="h-4 w-4" aria-hidden="true" />
                </span>
                <p className="text-sm font-semibold text-ankora-text">
                  Requêtes perdues (
                  <span className="font-mono">
                    {delta.queries_lost?.length ?? 0}
                  </span>
                  )
                </p>
              </div>
              {delta.queries_lost && delta.queries_lost.length > 0 ? (
                <ul className="space-y-1.5 text-sm text-ankora-text">
                  {delta.queries_lost.slice(0, 5).map((q) => (
                    <li
                      key={q}
                      className="flex items-start gap-2 leading-snug"
                    >
                      <span className="text-warning shrink-0">−</span>
                      <span className="first-letter:uppercase">{q}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ankora-text-muted">
                  Aucune requête perdue depuis le dernier audit.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Cas baseline (premier audit) — hint pour relancer dans 30j */}
      {!previous ? (
        <p className="text-center text-xs text-ankora-text-muted inline-flex items-center justify-center w-full gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary/70" aria-hidden="true" />
          Relancez un audit dans 30 jours pour mesurer vos progrès.
        </p>
      ) : null}
    </motion.section>
  );
}
