"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  CheckCircle2,
  Loader2,
  MessageSquare,
  Search,
  Sparkles,
  X as XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import {
  MANUAL_QUERIES_MAX,
  type ManualQueriesPayload,
  type ManualQueryResult,
} from "@/lib/report/types";
import { cn } from "@/lib/utils";

// =====================================================================
// <ManualQueries /> — bloc bonus de fin de rapport.
//
// L'utilisateur peut tester 1 a 3 questions de son choix apres avoir
// vu son rapport. Resultats AFFICHES BRUTS (par IA, oui/non +
// concurrents cites) — JAMAIS de score consolide ni d'impact sur le
// score officiel (anti-biais : un client cherry-pick des questions ou
// il sait qu'il est bon).
//
// Caveat NEUTRE (pas culpabilisant) — wording valide par Robin :
//   "Ces 3 questions sont celles qui vous importent le plus — les
//    resultats ci-dessous sont complementaires a l'audit objectif de
//    30 questions."
//
// Placeholders pre-remplis avec des requetes competitives realistes
// pour pousser l'utilisateur a tester des vraies questions difficiles
// plutot que ses requetes branded :
//   - "Meilleur [secteur] a [city_main]"
//   - "[secteur] pas cher [city_main]"
//   - "[city_main] [secteur] avis"
// L'utilisateur peut les modifier librement.
//
// Polling : apres POST, on poll GET /api/audits/[id]/manual-queries
// toutes les 3s jusqu'a ce que `pending=false`. Latence typique 30-60s.
// =====================================================================

type ManualQueriesProps = {
  auditId: string;
  industry: string | null;
  cityMain: string | null;
  city: string | null;
  // Etat initial recupere cote serveur (si l'utilisateur a deja
  // soumis ses queries lors d'une visite precedente). Permet de
  // bypass le form au mount.
  initial: ManualQueriesPayload;
};

const POLL_MS = 3_000;

// Heuristique partagee avec LostOpportunities : raccourcit l'industry
// pour des placeholders lisibles ("Hotellerie de luxe" -> "hotel").
function shortenIndustry(industry: string | null): string {
  if (!industry || industry.trim().length === 0) return "service";
  const lower = industry.toLowerCase();
  if (lower.includes("hotel") || lower.includes("hôtel")) return "hôtel";
  if (lower.includes("restaurant")) return "restaurant";
  if (lower.includes("yacht") || lower.includes("charter")) return "charter";
  if (lower.includes("immobilier")) return "agence immobilière";
  if (lower.includes("garage") || lower.includes("auto")) return "garage";
  if (lower.includes("coiffure") || lower.includes("salon"))
    return "salon de coiffure";
  if (lower.includes("avocat")) return "cabinet d'avocats";
  if (lower.includes("medecin") || lower.includes("médecin")) return "médecin";
  const firstWord = industry.split(/[,;.]|\s-\s/)[0].trim().toLowerCase();
  return firstWord.length > 0 && firstWord.length < 40 ? firstWord : "service";
}

// Construit les 3 placeholders selon la localisation. Si pas de
// city_main, fallback sur city, sinon "votre ville".
function buildPlaceholders(
  industry: string | null,
  cityMain: string | null,
  city: string | null
): string[] {
  const sector = shortenIndustry(industry);
  const place = cityMain ?? city ?? null;
  if (!place) {
    return [
      `Meilleur ${sector} de France`,
      `${sector} pas cher`,
      `${sector} avis`,
    ];
  }
  return [
    `Meilleur ${sector} à ${place}`,
    `${sector} pas cher ${place}`,
    `${place} ${sector} avis`,
  ];
}

// ---------------------------------------------------------------------
// Sous-composant : carte d'un resultat de query (1 query x 4 IA)
// ---------------------------------------------------------------------
function ResultCard({
  result,
  brandName,
}: {
  result: ManualQueryResult;
  brandName: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      <Card className="border-ankora-border">
        <CardContent className="pt-5 pb-5 px-5 sm:px-6 space-y-4">
          {/* Question */}
          <div className="rounded-xl border border-ankora-border bg-ankora-canvas/60 p-3 sm:p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-ankora-text-muted">
              Votre question
            </p>
            <p className="mt-1 text-base font-medium text-ankora-text leading-snug">
              &laquo; {result.query_text} &raquo;
            </p>
          </div>

          {result.pending ? (
            <div className="flex items-center gap-2 text-sm text-ankora-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Test en cours sur les 4 IA…
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {result.responses.map((r) => (
                <div
                  key={r.provider}
                  className="rounded-xl border border-ankora-border bg-card p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: r.provider_color }}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      {r.provider_label}
                    </span>
                    {r.brand_mentioned ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 text-success px-2 py-0.5 text-[10px] font-semibold">
                        <CheckCircle2 className="h-3 w-3" />
                        Cité
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 text-destructive px-2 py-0.5 text-[10px] font-semibold">
                        <XIcon className="h-3 w-3" />
                        Absent
                      </span>
                    )}
                  </div>
                  {!r.brand_mentioned && r.competitors_cited.length > 0 ? (
                    <p className="mt-2 text-xs text-ankora-text-soft leading-snug">
                      Cités à votre place :{" "}
                      <span className="font-semibold text-ankora-text">
                        {r.competitors_cited.slice(0, 3).join(", ")}
                      </span>
                    </p>
                  ) : null}
                  {r.brand_mentioned ? (
                    <p className="mt-2 text-xs text-ankora-text-muted leading-snug">
                      {brandName} apparaît dans la réponse.
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ---------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------
export function ManualQueries({
  auditId,
  industry,
  cityMain,
  city,
  initial,
  brandName,
}: ManualQueriesProps & { brandName: string }) {
  const reduce = useReducedMotion();
  const placeholders = React.useMemo(
    () => buildPlaceholders(industry, cityMain, city),
    [industry, cityMain, city]
  );

  const [payload, setPayload] = React.useState<ManualQueriesPayload>(initial);
  const [submitting, setSubmitting] = React.useState(false);
  const [polling, setPolling] = React.useState<boolean>(initial.pending);
  // 3 inputs, pre-remplis avec les placeholders. Le user peut effacer.
  const [inputs, setInputs] = React.useState<string[]>(() =>
    Array.from({ length: payload.remaining }, (_, i) => placeholders[i] ?? "")
  );

  const hasResults = payload.queries.length > 0;
  const canSubmit =
    !submitting && payload.remaining > 0 && inputs.some((v) => v.trim().length >= 5);

  // Polling pendant le processing
  React.useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    const id = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/audits/${auditId}/manual-queries`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as ManualQueriesPayload;
        if (cancelled) return;
        setPayload(data);
        if (!data.pending) {
          setPolling(false);
        }
      } catch {
        // Silencieux : le prochain tick prendra le relais
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [polling, auditId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const queries = inputs
      .map((v) => v.trim())
      .filter((v) => v.length >= 5 && v.length <= 200)
      .slice(0, payload.remaining);
    if (queries.length === 0) {
      toast.error("Saisissez au moins une question (5 caractères minimum).");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/audits/${auditId}/manual-queries`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queries }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        toast.error(data?.error ?? "Impossible d'envoyer les questions.");
        setSubmitting(false);
        return;
      }
      // Refresh immediat de l'etat (queries inserees, pending=true)
      const fresh = await fetch(`/api/audits/${auditId}/manual-queries`, {
        cache: "no-store",
      });
      if (fresh.ok) {
        const freshData = (await fresh.json()) as ManualQueriesPayload;
        setPayload(freshData);
        setPolling(true);
        // Reset des inputs vers les placeholders restants
        const remainingNow = freshData.remaining;
        setInputs(
          Array.from(
            { length: remainingNow },
            (_, i) => placeholders[i + freshData.count] ?? ""
          )
        );
      }
      toast.success("Questions envoyées — résultats dans ~30 secondes.");
    } catch {
      toast.error("Connexion impossible, réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -100px 0px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      aria-labelledby="manual-queries-title"
      className="space-y-6"
    >
      <div className="text-center">
        <p className="text-xs sm:text-sm font-medium uppercase tracking-[0.2em] text-ankora-text-muted">
          Vos questions personnalisées
        </p>
        <h2
          id="manual-queries-title"
          className="mt-3 font-display text-2xl sm:text-3xl font-bold tracking-tight text-ankora-text"
        >
          Testez 3 questions de votre choix sur les IA
        </h2>
        <p className="mt-3 text-sm sm:text-base text-ankora-text-soft max-w-2xl mx-auto">
          Ces {MANUAL_QUERIES_MAX} questions sont celles qui vous importent
          le plus. Les résultats sont{" "}
          <span className="font-semibold text-ankora-text">
            complémentaires
          </span>{" "}
          à l&apos;audit objectif de 30 questions ci-dessus.
        </p>
      </div>

      {/* Resultats existants */}
      {hasResults ? (
        <div className="space-y-3">
          {payload.queries.map((q) => (
            <ResultCard key={q.query_id} result={q} brandName={brandName} />
          ))}
        </div>
      ) : null}

      {/* Form (visible tant que remaining > 0) */}
      {payload.remaining > 0 ? (
        <Card className="border-ankora-border bg-secondary/20">
          <CardContent className="pt-6 pb-6 px-5 sm:px-7">
            <div className="flex items-start gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
                aria-hidden="true"
              >
                <Search className="h-4 w-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-display text-base sm:text-lg font-semibold text-ankora-text">
                  {hasResults
                    ? `Ajoutez ${payload.remaining} question${payload.remaining > 1 ? "s" : ""} de plus`
                    : `Vos ${payload.remaining} questions à tester`}
                </p>
                <p className="mt-1 text-xs text-ankora-text-muted">
                  Suggestions pré-remplies. Modifiez-les ou gardez-les telles
                  quelles.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-3" noValidate>
              {Array.from({ length: payload.remaining }).map((_, i) => (
                <div key={i}>
                  <Label
                    htmlFor={`manual-q-${i}`}
                    className="sr-only"
                  >{`Question ${i + 1}`}</Label>
                  <Input
                    id={`manual-q-${i}`}
                    type="text"
                    value={inputs[i] ?? ""}
                    onChange={(e) => {
                      const next = [...inputs];
                      next[i] = e.target.value;
                      setInputs(next);
                    }}
                    placeholder={placeholders[i + payload.count]}
                    disabled={submitting || polling}
                    maxLength={200}
                    className="text-sm"
                  />
                </div>
              ))}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                <p className="text-xs text-ankora-text-muted">
                  Test en direct sur ChatGPT, Claude, Perplexity et Gemini.
                </p>
                <Button
                  type="submit"
                  variant="gradient"
                  size="default"
                  disabled={!canSubmit}
                  className="shrink-0"
                >
                  {submitting ? (
                    <>
                      <Loader2
                        className="mr-2 h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                      Envoi…
                    </>
                  ) : polling ? (
                    <>
                      <Loader2
                        className="mr-2 h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                      Test en cours…
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                      Tester ces questions
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <p className="text-center text-xs text-ankora-text-muted">
          Vous avez utilisé vos {MANUAL_QUERIES_MAX} questions personnalisées
          pour cet audit.
        </p>
      )}

      {polling ? (
        <p
          className="text-center text-sm text-ankora-text-soft inline-flex items-center justify-center w-full gap-2"
          role="status"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Analyse des questions par les 4 IA — environ 30 secondes…
        </p>
      ) : null}
    </motion.section>
  );
}
