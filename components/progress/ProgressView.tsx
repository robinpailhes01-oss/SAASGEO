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
import type { AuditStatusResponse } from "@/app/api/audits/[id]/status/route";

// =====================================================================
// <ProgressView /> — orchestrateur de la page de progression.
//
// Sources de mise a jour (en parallele, redondantes par securite) :
//   1. Supabase Realtime — channel UPDATE sur audits.id (instantane)
//   2. Polling REST /api/audits/[id]/status toutes les 2s (fallback)
//
// Etats terminaux :
//   - status === "done" -> router.replace(`/audit/${id}`) IMMEDIAT
//     (pas d'ecran de celebration intermediaire — cf. brief "rediriger
//     immediatement" pour eviter de garder l'user sur /progress alors
//     que le rapport est pret).
//   - status === "failed" -> <AuditFailedState />
//
// Etats non-terminaux avec actions utilisateur :
//   - apres 8 min sans status terminal -> bandeau "L'analyse prend plus
//     de temps que prevu" + auto-abort silencieux + 2 boutons
//     [Verifier l'etat] / [Relancer l'audit]
//
// MAPPING STATUT ENUM -> PROGRESS (defense en profondeur) :
//   Le backend Inngest peut avoir un trou d'update (progress=0 alors
//   que status='extracting'). Le helper effectiveProgress() projette
//   un seuil minimum cote client a partir du status. Plus jamais
//   "0% bloque" si le status avance correctement.
// =====================================================================

const POLL_MS = 2_000;
// Brief : "Si status reste 'queued' ou 'scraping' depuis plus de 8
// minutes -> afficher bouton 'Relancer l'audit' et marquer le status
// 'failed' automatiquement."
const STUCK_TIMEOUT_MS = 8 * 60 * 1_000;

// Mapping status enum -> progression minimale. Si la DB n'a pas mis
// a jour `progress` mais le `status` a avance, on utilise ce mapping
// comme plancher pour ne pas afficher 0% bloque. Aligne avec le brief.
const STATUS_PROGRESS_FLOOR: Record<string, number> = {
  queued: 5,
  scraping: 15,
  extracting: 30,
  querying: 50,
  analyzing: 75,
  scoring: 90,
  done: 100,
  failed: 0, // pas de projection, on garde le progress recu
};

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

// Progress effectif = max entre la valeur DB et le plancher du status
// enum. Garantit qu'on n'affiche jamais 0% si le status est avance.
function effectiveProgress(audit: AuditStatusResponse): number {
  if (audit.status === "failed") return audit.progress;
  const floor = STATUS_PROGRESS_FLOOR[audit.status] ?? 0;
  return Math.max(audit.progress, floor);
}

// Texte temps estime selon le progress courant.
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
  const [refreshing, setRefreshing] = React.useState(false);
  const [aborting, setAborting] = React.useState(false);
  const lastSerializedRef = React.useRef<string>(JSON.stringify(initialAudit));
  // Garde-fou : si le router.replace a deja ete appele on n'enchaine
  // pas plusieurs redirections (StrictMode + polling concurrent).
  const redirectedRef = React.useRef(false);

  // Helper : ne declenche un setState que si quelque chose a reellement
  // change (evite les re-renders inutiles + animation).
  const updateIfChanged = React.useCallback((next: AuditStatusResponse) => {
    const ser = JSON.stringify(next);
    if (ser === lastSerializedRef.current) return;
    lastSerializedRef.current = ser;
    setAudit(next);
  }, []);

  const isFailed = audit.status === "failed";
  // isDone declenche la redirection immediate. progress >= 100 sans
  // status='done' est un filet de securite pour absorber un eventuel
  // bug backend (status reste a 'scoring' alors que finalize a tourne).
  const isDone = audit.status === "done" || audit.progress >= 100;
  const isTerminal = isDone || isFailed;

  // ---- Redirection immediate vers le rapport quand isDone ----
  // Brief : "Quand status === 'done' -> rediriger immediatement vers
  // /audit/[id]". On utilise router.replace pour ne pas polluer
  // l'historique (back depuis le rapport ne doit pas revenir sur /progress).
  React.useEffect(() => {
    if (!isDone) return;
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    router.replace(`/audit/${audit.id}`);
  }, [isDone, audit.id, router]);

  // ---- Polling REST (toutes les 2s jusqu'au terminal) ----
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

  // ---- Detection blocage : > 8 min sans status terminal ----
  // Brief : "marquer le status 'failed' automatiquement". On call
  // /abort en background des l'apparition du banner (silencieux —
  // l'user voit deja le bouton "Relancer", il n'a pas besoin d'etre
  // notifie de l'auto-fail).
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
      // Auto-abort silencieux pour eviter que l'audit reste pendu
      fetch(`/api/audits/${audit.id}/abort`, { method: "POST" }).catch(
        () => null
      );
      return;
    }
    const id = window.setTimeout(() => {
      setShowStuckBanner(true);
      fetch(`/api/audits/${audit.id}/abort`, { method: "POST" }).catch(
        () => null
      );
    }, remaining);
    return () => window.clearTimeout(id);
  }, [audit.created_at, audit.id, isTerminal]);

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
      window.setTimeout(() => setRefreshing(false), 600);
    }
  }, [audit.id, refreshing, updateIfChanged]);

  // ---- Action "Relancer l'audit" : redirige vers / ----
  // Note : /abort a deja ete call en background des l'apparition du
  // banner, on n'a pas besoin de le re-call ici.
  const handleAbort = React.useCallback(async () => {
    if (aborting) return;
    setAborting(true);
    toast.success("Vous pouvez relancer un nouvel audit.");
    router.push("/");
  }, [aborting, router]);

  const domain = prettyDomain(audit.url);
  const progressEff = effectiveProgress(audit);

  // Si isDone, on retourne un overlay minimal pendant que la
  // redirection est en cours. Pas de celebration intermediaire —
  // l'user va directement sur le rapport.
  if (isDone) {
    return (
      <main className="min-h-screen bg-background py-12 sm:py-16">
        <Container size="narrow">
          <p className="text-center text-base text-ankora-text-soft inline-flex items-center justify-center w-full gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Redirection vers votre rapport…
          </p>
        </Container>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background py-8 sm:py-12">
      <Container size="narrow" className="space-y-8 sm:space-y-10">
        <ProgressHeader
          domain={domain}
          progress={isFailed ? audit.progress : progressEff}
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
            Analyse en cours · {estimatedTimeLabel(progressEff)}
          </p>
        ) : null}

        {isFailed && <AuditFailedState errorMessage={audit.error_message} />}

        {!isTerminal && (
          <>
            {/* Bandeau "stuck" : > 8 min sans status terminal. L'audit
                a deja ete marque failed en background (auto-abort) — on
                affiche juste les actions pour le user. */}
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
                      L&apos;analyse prend plus de temps que prévu. Vous
                      pouvez vérifier l&apos;état ou relancer un nouvel audit.
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
            <StepsList progress={progressEff} />
          </>
        )}
      </Container>
    </main>
  );
}
