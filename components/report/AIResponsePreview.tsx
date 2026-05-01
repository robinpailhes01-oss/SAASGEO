"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, MessageSquare, X as XIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { normalizeCompetitorKey, type AIResponseSample } from "@/lib/report/types";

// =====================================================================
// <AIResponsePreview /> — bloc 5 : apercu en direct d'une reponse IA.
//
// LE moment "wow" du rapport. Affiche 1 ou 2 cartes avec :
//   - badge IA (ChatGPT/Claude/...)
//   - question testee (texte exact)
//   - reponse IA tronquee (~250 chars)
//   - badges "marque non citee" + "concurrent X cite"
//   - bouton "Voir la reponse complete" -> Dialog avec highlight
//
// Animation d'entree : scale 0.95 -> 1 + fade-in, plus marque que les
// autres blocs pour appuyer le wow.
// =====================================================================

type AIResponsePreviewProps = {
  samples: AIResponseSample[];
  brandName: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  branded: "Question marque",
  service: "Question service",
  comparative: "Question comparative",
};

// ---------------------------------------------------------------------
// Highlight des noms de concurrents et de la marque dans le texte.
// On segmente le texte sur les occurrences (insensible a la casse) et
// on emballe chaque match dans un <mark>. Approche en passes (un nom
// a la fois) pour rester simple — parfait pour des textes <2000 chars.
// ---------------------------------------------------------------------

type Segment = { text: string; mark?: "brand" | "competitor" };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(
  text: string,
  brandName: string,
  competitors: string[]
): Segment[] {
  // Liste de patterns a marker, ordre par longueur desc (priorite aux
  // matches les plus longs pour eviter des partial-matches).
  const targets: Array<{ value: string; mark: "brand" | "competitor" }> = [];
  if (brandName.trim()) {
    targets.push({ value: brandName.trim(), mark: "brand" });
  }
  // Dedup competitors par cle normalisee
  const seenKeys = new Set<string>();
  for (const c of competitors) {
    if (!c) continue;
    const k = normalizeCompetitorKey(c);
    if (!k || seenKeys.has(k)) continue;
    seenKeys.add(k);
    targets.push({ value: c.trim(), mark: "competitor" });
  }
  targets.sort((a, b) => b.value.length - a.value.length);

  let segments: Segment[] = [{ text }];
  for (const t of targets) {
    const re = new RegExp(`(${escapeRegExp(t.value)})`, "gi");
    const next: Segment[] = [];
    for (const seg of segments) {
      if (seg.mark) {
        next.push(seg);
        continue;
      }
      const parts = seg.text.split(re);
      for (const p of parts) {
        if (!p) continue;
        if (p.toLowerCase() === t.value.toLowerCase()) {
          next.push({ text: p, mark: t.mark });
        } else {
          next.push({ text: p });
        }
      }
    }
    segments = next;
  }
  return segments;
}

function HighlightedText({
  text,
  brandName,
  competitors,
}: {
  text: string;
  brandName: string;
  competitors: string[];
}) {
  const segments = React.useMemo(
    () => highlightText(text, brandName, competitors),
    [text, brandName, competitors]
  );
  return (
    <p className="text-base text-ankora-text leading-relaxed whitespace-pre-wrap">
      {segments.map((seg, i) =>
        seg.mark === "competitor" ? (
          <mark
            key={i}
            className="rounded-md bg-primary/15 px-1 py-0.5 font-semibold text-primary"
          >
            {seg.text}
          </mark>
        ) : seg.mark === "brand" ? (
          <mark
            key={i}
            className="rounded-md bg-success/15 px-1 py-0.5 font-semibold text-success"
          >
            {seg.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{seg.text}</React.Fragment>
        )
      )}
    </p>
  );
}

// ---------------------------------------------------------------------
// Une carte d'apercu individuelle
// ---------------------------------------------------------------------
function SampleCard({
  sample,
  brandName,
  index,
}: {
  sample: AIResponseSample;
  brandName: string;
  index: number;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = React.useState(false);
  const showFull = sample.response_full.length > sample.response_preview.length;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.15, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="overflow-hidden border-ankora-border shadow-sm">
        <CardContent className="p-5 sm:p-6 space-y-4">
          {/* Header : badge IA + categorie */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: `${sample.provider_color}1f`,
                  color: sample.provider_color,
                }}
                aria-hidden="true"
              >
                <MessageSquare className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ankora-text leading-tight">
                  Voici ce que dit{" "}
                  <span style={{ color: sample.provider_color }}>
                    {sample.provider_label}
                  </span>
                </p>
                <p className="text-xs text-ankora-text-muted">
                  {CATEGORY_LABEL[sample.query_category] ??
                    sample.query_category}
                </p>
              </div>
            </div>
          </div>

          {/* Question */}
          <div className="rounded-xl border border-ankora-border bg-ankora-canvas/60 p-3 sm:p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-ankora-text-muted">
              Question testée
            </p>
            <p className="mt-1.5 text-base font-medium text-ankora-text leading-snug">
              &laquo; {sample.query_text} &raquo;
            </p>
          </div>

          {/* Reponse tronquee avec highlight */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-ankora-text-muted">
              Réponse de {sample.provider_label}
            </p>
            <div className="mt-1.5">
              <HighlightedText
                text={sample.response_preview}
                brandName={brandName}
                competitors={sample.competitors_cited}
              />
            </div>
          </div>

          {/* Badges marque + competitors */}
          <ul className="flex flex-wrap gap-2">
            <li>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                  sample.brand_mentioned
                    ? "bg-success/15 text-success"
                    : "bg-destructive/15 text-destructive"
                )}
              >
                {sample.brand_mentioned ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <XIcon className="h-3.5 w-3.5" />
                )}
                {sample.brand_mentioned
                  ? `${brandName} est mentionnée`
                  : `${brandName} n'est pas mentionnée`}
              </span>
            </li>
            {sample.competitors_cited.slice(0, 4).map((c, i) => (
              <li key={`${c}-${i}`}>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {c} est mentionné
                </span>
              </li>
            ))}
          </ul>

          {/* CTA voir la reponse complete */}
          {showFull ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  Voir la réponse complète →
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="text-left">
                    Réponse complète de {sample.provider_label}
                  </DialogTitle>
                  <p className="mt-1 text-sm text-ankora-text-muted text-left">
                    Question : &laquo; {sample.query_text} &raquo;
                  </p>
                </DialogHeader>
                <div className="mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-ankora-border bg-ankora-canvas/40 p-4">
                  <HighlightedText
                    text={sample.response_full}
                    brandName={brandName}
                    competitors={sample.competitors_cited}
                  />
                </div>
              </DialogContent>
            </Dialog>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ---------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------
export function AIResponsePreview({
  samples,
  brandName,
}: AIResponsePreviewProps) {
  if (samples.length === 0) return null;

  // Texte d'introduction adapte au cas
  const allMentioned = samples.every((s) => s.brand_mentioned);

  return (
    <section
      className="space-y-6"
      aria-labelledby="ai-response-preview-label"
    >
      <div className="text-center">
        <p
          id="ai-response-preview-label"
          className="text-xs sm:text-sm font-medium uppercase tracking-[0.2em] text-ankora-text-muted"
        >
          {allMentioned ? "Vous apparaissez bien" : "Voici ce qu'ils voient"}
        </p>
        <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold tracking-tight text-ankora-text">
          {allMentioned
            ? "Vos clients vous trouvent dans les réponses IA"
            : "Vos clients posent ces questions. Vous n'êtes pas dans la réponse."}
        </h2>
      </div>

      <div className="grid gap-4 sm:gap-5">
        {samples.map((s, i) => (
          <SampleCard
            key={s.id}
            sample={s}
            brandName={brandName}
            index={i}
          />
        ))}
      </div>
    </section>
  );
}
