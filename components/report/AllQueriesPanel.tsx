"use client";

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  CheckCircle2,
  ChevronDown,
  Flag,
  Map,
  MapPin,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type {
  AllQueryRow,
  QueryCategory,
  QueryGeoLevel,
} from "@/lib/report/types";
import { cn } from "@/lib/utils";

// =====================================================================
// <AllQueriesPanel /> — bloc collapsible "Toutes les questions testees".
//
// Affiche les 30 queries source='generated' regroupees par niveau
// geographique (city_main / city_exact / region / national). Pour
// chaque query : icone presence (V/X) + concurrent principal cite si
// la marque est absente.
//
// Etat par defaut : ferme. Bouton "Voir les 30 questions testees ->"
// pour ouvrir. Une fois ouvert : "Masquer les questions ↑".
//
// Position dans la page rapport : entre AIResponsePreview (5) et
// WhyInvisible (6). Place pour donner de la profondeur ("voila ce
// qu'on a TESTE en detail") avant les recommandations.
// =====================================================================

type AllQueriesPanelProps = {
  queries: AllQueryRow[];
  brandName: string;
  // Localisation pour adapter les libelles de section :
  // - cityMain et cityExact peuvent etre identiques (sameMainExact)
  //   -> on n'affiche qu'une section "Questions locales"
  cityMain: string | null;
  city: string | null;
  region: string | null;
};

type GeoSection = {
  level: QueryGeoLevel;
  icon: LucideIcon;
  emoji: string;
  label: string;
  hint: string | null;
};

// "branded" -> "Notoriete" : ces questions ne mesurent pas la VRAIE
// visibilite commerciale (le client connait deja le nom de la marque
// dans la question). Elles sont conservees pour transparence mais
// SONT EXCLUES DU SCORE PRINCIPAL — cf. lib/ai/visibility-tracker.
const CATEGORY_LABEL: Record<QueryCategory, string> = {
  branded: "Notoriété",
  service: "Sectoriel",
  comparative: "Comparatif",
};

const CATEGORY_COLOR: Record<QueryCategory, string> = {
  branded: "bg-primary/10 text-primary",
  service: "bg-fuchsia-500/10 text-fuchsia-700",
  comparative: "bg-rose-500/10 text-rose-700",
};

// Ligne d'une query
function QueryLine({
  q,
  brandName,
}: {
  q: AllQueryRow;
  brandName: string;
}) {
  const cited = q.brand_mentioned;
  return (
    <li className="flex items-start gap-3 sm:gap-4 py-3 px-4 sm:px-5 border-b border-ankora-border last:border-b-0 hover:bg-secondary/30 transition-colors">
      {/* Icone presence */}
      <span
        className={cn(
          "shrink-0 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full",
          cited
            ? "bg-success/15 text-success"
            : "bg-destructive/15 text-destructive"
        )}
        aria-label={cited ? `${brandName} apparaît` : `${brandName} absent`}
        role="img"
      >
        {cited ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : (
          <XCircle className="h-3.5 w-3.5" />
        )}
      </span>

      {/* Texte query + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm sm:text-base text-ankora-text leading-snug">
          {q.text}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ankora-text-muted">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              CATEGORY_COLOR[q.category]
            )}
          >
            {CATEGORY_LABEL[q.category]}
          </span>
          {!cited && q.top_competitor ? (
            <span className="text-ankora-text-soft">
              <span className="font-medium text-ankora-text">
                {q.top_competitor}
              </span>{" "}
              cité à votre place
            </span>
          ) : null}
          {!cited && !q.top_competitor ? (
            <span className="text-ankora-text-muted italic">
              Aucun acteur cité
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

// Section regroupant les queries d'un meme geo_level
function GeoSectionBlock({
  section,
  queries,
  brandName,
}: {
  section: GeoSection;
  queries: AllQueryRow[];
  brandName: string;
}) {
  if (queries.length === 0) return null;
  const Icon = section.icon;
  return (
    <div className="rounded-2xl border border-ankora-border bg-card overflow-hidden">
      <header className="px-4 sm:px-5 py-3 border-b border-ankora-border bg-secondary/40 flex items-center gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-card text-xl"
          aria-hidden="true"
        >
          {section.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm sm:text-base font-semibold text-ankora-text leading-tight inline-flex items-center gap-2">
            <Icon
              className="h-3.5 w-3.5 text-ankora-text-muted hidden sm:inline-block"
              aria-hidden="true"
            />
            {section.label}
          </p>
          {section.hint ? (
            <p className="text-xs text-ankora-text-muted leading-tight mt-0.5">
              {section.hint}
            </p>
          ) : null}
        </div>
        <span className="font-mono text-xs tabular-nums text-ankora-text-muted shrink-0">
          {queries.length} question{queries.length > 1 ? "s" : ""}
        </span>
      </header>
      <ul>
        {queries.map((q) => (
          <QueryLine key={q.query_id} q={q} brandName={brandName} />
        ))}
      </ul>
    </div>
  );
}

export function AllQueriesPanel({
  queries,
  brandName,
  cityMain,
  city,
  region,
}: AllQueriesPanelProps) {
  const reduce = useReducedMotion();
  const [open, setOpen] = React.useState(false);

  if (queries.length === 0) return null;

  // Cas sameMainExact : si city_main === city (ex: Paris audit a Paris),
  // on fusionne city_main et city_exact dans une seule section.
  const sameMainExact =
    !!cityMain &&
    !!city &&
    cityMain.toLowerCase().trim() === city.toLowerCase().trim();

  // Build sections dynamiques selon ce qui est disponible
  const sections: GeoSection[] = [];
  if (cityMain || city) {
    sections.push({
      level: "city_main",
      icon: MapPin,
      emoji: "📍",
      label: sameMainExact
        ? `Questions locales (${cityMain ?? city})`
        : `Questions ${cityMain} (grande ville de référence)`,
      hint: sameMainExact
        ? "Là où vos prospects cherchent en priorité"
        : "Là où la majorité de vos prospects cherchent",
    });
  }
  if (!sameMainExact && city) {
    sections.push({
      level: "city_exact",
      icon: MapPin,
      emoji: "📌",
      label: `Questions ${city} (ville exacte)`,
      hint: "Recherches très ciblées localement",
    });
  }
  if (region) {
    sections.push({
      level: "region",
      icon: Map,
      emoji: "🗺️",
      label: `Questions ${region} (région)`,
      hint: "Recherches élargies au département / à la région",
    });
  }
  sections.push({
    level: "national",
    icon: Flag,
    emoji: "🇫🇷",
    label: "Questions nationales",
    hint: "Pour comparer au marché français large",
  });

  // Group queries by geo_level. Si sameMainExact, on fusionne les
  // queries city_exact dans la section city_main.
  const byLevel: Record<QueryGeoLevel, AllQueryRow[]> = {
    city_main: [],
    city_exact: [],
    region: [],
    national: [],
  };
  for (const q of queries) {
    if (sameMainExact && q.geo_level === "city_exact") {
      byLevel.city_main.push(q);
    } else {
      byLevel[q.geo_level].push(q);
    }
  }
  // Tri par position au sein de chaque groupe (stable)
  for (const level of Object.keys(byLevel) as QueryGeoLevel[]) {
    byLevel[level].sort((a, b) => a.position - b.position);
  }

  const totalCited = queries.filter((q) => q.brand_mentioned).length;

  return (
    <section
      className="space-y-4"
      aria-labelledby="all-queries-title"
    >
      <Card className="border-ankora-border">
        <CardContent className="pt-5 pb-5 px-5 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-medium uppercase tracking-[0.18em] text-ankora-text-muted">
                Détail complet
              </p>
              <h2
                id="all-queries-title"
                className="mt-1 font-display text-lg sm:text-xl font-semibold text-ankora-text leading-snug"
              >
                {queries.length} questions testées sur les 4 IA
                {totalCited > 0 ? (
                  <>
                    {" "}—{" "}
                    <span className="text-success font-bold">
                      {totalCited} citent {brandName}
                    </span>
                  </>
                ) : null}
              </h2>
            </div>
            <Button
              variant={open ? "outline" : "default"}
              size="sm"
              onClick={() => setOpen((prev) => !prev)}
              className="shrink-0"
              aria-expanded={open}
              aria-controls="all-queries-content"
            >
              {open ? (
                <>
                  Masquer les questions{" "}
                  <ChevronDown
                    className="ml-1.5 h-4 w-4 rotate-180 transition-transform"
                    aria-hidden="true"
                  />
                </>
              ) : (
                <>
                  Voir les {queries.length} questions testées
                  <ChevronDown
                    className="ml-1.5 h-4 w-4 transition-transform"
                    aria-hidden="true"
                  />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id="all-queries-content"
            key="content"
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 pt-1">
              {sections.map((section) => (
                <GeoSectionBlock
                  key={section.level}
                  section={section}
                  queries={byLevel[section.level]}
                  brandName={brandName}
                />
              ))}
              <p className="text-center text-xs text-ankora-text-muted pt-2">
                Toutes les questions ont été posées aux 4 IA (ChatGPT,
                Claude, Perplexity, Gemini) — soit{" "}
                <span className="font-mono font-semibold">
                  {queries.length * 4}
                </span>{" "}
                réponses analysées.
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
