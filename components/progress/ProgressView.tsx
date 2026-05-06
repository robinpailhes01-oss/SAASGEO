"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";

import { ProgressHeader } from "./ProgressHeader";
import { StepsList } from "./StepsList";
import { EngagementTip } from "./EngagementTip";
import { AuditFailedState } from "./AuditFailedState";
import { AuditDoneCta } from "./AuditDoneCta";
import type { AuditStatusResponse } from "@/app/api/audits/[id]/status/route";

// =====================================================================
// <ProgressView /> — orchestrateur de la page de progression.
//
// Sources de mise a jour (en parallele, redondantes par securite) :
//   1. Supabase Realtime — channel UPDATE sur audits.id (instantane)
//   2. Polling REST /api/audits/[id]/status toutes les 2s (rapproche
//      pour donner une perception d'activite meme si progress=0)
//
// Etats terminaux :
//   - status === "done" OU progress >= 100  -> <AuditDoneCta />
//   - status === "failed" -> <AuditFailedState />
//
// Etats non-terminaux avec actions utilisateur :
//   - apres 5 min sans status terminal -> bandeau "L'analyse prend plus
//     de temps que prevu" + 2 boutons :
//       * "Verifier l'etat" : force un fetch immediat
//       * "Relancer l'audit" : POST /abort + redirige vers /
//
// Le bandeau ne masque PAS la liste des steps — l'utilisateur garde
// le contexte visuel de ce qui a deja tourne.
// =====================================================================

const POLL_MS = 2_000;
// Apres 5 min sans status terminal, on affiche le bandeau d'actions.
// Le pipeline tourne en moyenne 2-3 min en prod ; au-dela de 5 min on
// considere que c'est anormal.
const STUCK_TIMEOUT_MS = 5 * 60 * 1_000;

type ProgressViewProps = {
  initialAudit: AuditStatusResponse;
};

// Extrait un domaine lisible depuis une URL stockee
function prettyDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Texte temps estime selon le progress courant. Pas de chiffre invente
// — fenetres realistes basees sur la duree moyenne mesuree (~2.5 min).
function estimatedTimeLabel(progress: number): string {
  if (progress >= 95) return "Finalisation…";
  if (progress >= 70) return "Plus que quelques secondes…";
  if (progress >= 40) return "Résultats dans environ 2 minutes";
  if (progress >= 10) return "Résultats dans environ 3 minutes";
  return "Résultats dans environ 3 à 4 minutes";
}

export function ProgressView({ initialAudit }: ProgressViewProps) {
  const router = useRouter();
  const [audit, setAudit] = React.useState<AuditStatusResponse>(initialAudit);
  const [showStuckBanner, setShowStuckBanner] = React.useState(false);
  const [aborting, setAborting] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const lastSerializedRef = React.useRef<string>(JSON.stringify(initialAudit));

  // Helper : ne declenche un setState que si quelque chose a reellement change
  const updateIfChanged = React.useCallback((next: AuditStatusResponse) => {
    const ser = JSON.stringify(next);
    if (ser === lastSerializedRef.current) return;
    lastSerializedRef.current = ser;
    setAudit(next);
  }, []);

  const isFailed = audit.status === "failed";
  const isDone = audit.status === "done" || audit.progress >= 100;
  const isTerminal = isDone || isFailed;

  // ---- Polling REST (fallback toujours actif jusqu'au terminal) ----
  React.useEffect(() => {
    if (isTerminal) return;
    let cancelled = false;
    const id = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/audits/${audit.id}/status`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as AuditStatusResponse;
        if (!cancelled) updateIfChanged(data);
      } catch {
        // Silencieux : Realtime ou prochain tick prendront le relais
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [audit.id, isTerminal, updateIfChanged]);

  // ---- Realtime Supabase (canal direct WebSocket) ----
  React.useEffect(() => {
    if (isTerminal) return;
    const sb = createClient();
    let channel: RealtimeChannel | null = null;
    try {
      channel = sb
        .channel(`audit:${audit.id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "audits",
            filter: `id=eq.${audit.id}`,
          },
          (payload) => {
            const row = payload.new as Partial<AuditStatusResponse>;
            updateIfChanged({
              ...audit,
              ...row,
            } as AuditStatusResponse);
          }
        )
        .subscribe();
    } catch {
      // Si Realtime n'est pas active, le polling prend le relais.
    }
    return () => {
      if (channel) sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit.id, isTerminal]);

  // ---- Detection blocage : > 5 min sans status terminal ----
  React.useEffect(() => {
    if (isTerminal) {
      setShowStuckBanner(false);
      return;
    }
    const startedAtMs = new Date(audit.created_at).getTime();
    const elapsed = Date.now() - startedAtMs;
    const remaining = STUCK_TIMEOUT_MS - elapsed;
    if (remaining <= 0) {
      setShowStuckBanner(true);
      return;
    }
    const id = window.setTimeout(() => setShowStuckBanner(true), remaining);
    return () => window.clearTimeout(id);
  }, [audit.created_at, isTerminal]);

  // ---- Action "Verifier l'etat" : force un fetch immediat ----
  const handleRefresh = React.useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/audits/${audit.id}/status`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as AuditStatusResponse;
        updateIfChanged(data);
      }
    } catch {
      // Silencieux — le polling prochain reprendra
    } finally {
      // Petit delai pour donner un feedback visible meme si la requete
      // a ete instantanee.
      window.setTimeout(() => setRefreshing(false), 600);
    }
  }, [audit.id, refreshing, updateIfChanged]);

  // ---- Action "Relancer l'audit" : POST /abort + redirige ----
  const handleAbort = React.useCallback(async () => {
    if (aborting) return;
    setAborting(true);
    try {
      // Marque l'audit failed cote backend pour ne pas le laisser
      // pendre indefiniment dans la liste des audits "queued/extracting".
      // Echec d'API non-bloquant pour la nav (le user veut surtout repartir).
      await fetch(`/api/audits/${audit.id}/abort`, {
        method: "POST",
      }).catch(() => null);
    } finally {
      toast.success("Vous pouvez relancer un nouvel audit.");
      router.push("/");
    }
  }, [audit.id, aborting, router]);

  const domain = prettyDomain(audit.url);

  return (
    <main className="min-h-screen bg-background py-8 sm:py-12">
      <Container size="narrow" className="space-y-8 sm:space-y-10">
        <ProgressHeader
          domain={domain}
          progress={isFailed ? audit.progress : isDone ? 100 : audit.progress}
          startedAt={audit.created_at}
          frozen={isTerminal}
        />

        {/* Temps estime sous la barre — uniquement si non-terminal et
            pas dans l'etat stuck. Donne au client un horizon clair. */}
        {!isTerminal && !showStuckBanner ? (
          <p
            className="-mt-4 sm:-mt-5 text-center text-sm text-ankora-text-muted inline-flex items-center justify-center w-full gap-2"
            role="status"
            aria-live="polite"
          >
            <Loader2
              className="h-3.5 w-3.5 animate-spin"
              aria-hidden="true"
            />
            Analyse en cours · {estimatedTimeLabel(audit.progress)}
          </p>
        ) : null}

        {isFailed && <AuditFailedState errorMessage={audit.error_message} />}

        {isDone && <AuditDoneCta auditId={audit.id} />}

        {!isTerminal && (
          <>
            {/* Bandeau "stuck" : > 5 min sans status terminal */}
            {showStuckBanner && (
              <Card
                className="border-2 border-warning/40 bg-warning/5"
                role="status"
              >
                <CardContent className="pt-5 pb-5 px-5 sm:px-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-warning/15 text-warning"
                    aria-hidden="true"
                  >
                    <AlertTriangle className="h-5 w-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-warning">
                      Analyse plus longue que prévu
                    </p>
                    <p className="mt-1 text-sm sm:text-base text-ankora-text leading-snug">
                      L&apos;analyse prend plus de temps que prévu. Pas
                      d&apos;inquiétude, vous pouvez vérifier l&apos;état ou
                      relancer un nouvel audit.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 shrink-0 w-full sm:w-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRefresh}
                      disabled={refreshing}
                      className="w-full sm:w-auto"
                    >
                      {refreshing ? (
                        <>
                          <Loader2
                            className="mr-1.5 h-4 w-4 animate-spin"
                            aria-hidden="true"
                          />
                          Vérification…
                        </>
                      ) : (
                        <>
                          <RefreshCw
                            className="mr-1.5 h-4 w-4"
                            aria-hidden="true"
                          />
                          Vérifier l&apos;état
                        </>
                      )}
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleAbort}
                      disabled={aborting}
                      className="w-full sm:w-auto"
                    >
                      {aborting ? (
                        <>
                          <Loader2
                            className="mr-1.5 h-4 w-4 animate-spin"
                            aria-hidden="true"
                          />
                          Redirection…
                        </>
                      ) : (
                        <>
                          <RotateCcw
                            className="mr-1.5 h-4 w-4"
                            aria-hidden="true"
                          />
                          Relancer l&apos;audit
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <EngagementTip />
            <StepsList progress={audit.progress} />
          </>
        )}
      </Container>
    </main>
  );
}
