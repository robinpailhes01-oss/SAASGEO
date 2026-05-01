"use client";

import * as React from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { Container } from "@/components/layout/Container";

import { ProgressHeader } from "./ProgressHeader";
import { StepsList } from "./StepsList";
import { EngagementTip } from "./EngagementTip";
import { AuditFailedState } from "./AuditFailedState";
import { AuditDoneCta } from "./AuditDoneCta";
import type { AuditStatusResponse } from "@/app/api/audits/[id]/status/route";

// =====================================================================
// <ProgressView /> — orchestrateur de la page de progression.
//
// Sources de mise à jour (en parallèle, redondantes par sécurité) :
//   1. Supabase Realtime — channel UPDATE sur audits.id (instantané)
//   2. Polling REST /api/audits/[id]/status toutes les 3 s (fallback
//      au cas où Realtime n'est pas activé sur la table ou se déco)
//
// Le state est un single source of truth (`audit`). Les deux mécanismes
// l'alimentent via setAudit ; un useRef évite de re-render si la donnée
// reçue est identique à la précédente (économie d'animation pour rien).
//
// États terminaux :
//   - status === "done"   -> remplace les étapes par <AuditDoneCta />
//   - status === "failed" -> remplace par <AuditFailedState />
//   - timeout 10 min      -> message d'attente prolongée (audit continue)
// =====================================================================

const POLL_MS = 3_000;
const TIMEOUT_MS = 10 * 60 * 1_000;

type ProgressViewProps = {
  initialAudit: AuditStatusResponse;
};

// Extrait un domaine lisible depuis une URL stockée
function prettyDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ProgressView({ initialAudit }: ProgressViewProps) {
  const [audit, setAudit] = React.useState<AuditStatusResponse>(initialAudit);
  const [showTimeoutNote, setShowTimeoutNote] = React.useState(false);
  const lastSerializedRef = React.useRef<string>(JSON.stringify(initialAudit));

  // Helper : ne déclenche un setState que si quelque chose a réellement changé
  const updateIfChanged = React.useCallback((next: AuditStatusResponse) => {
    const ser = JSON.stringify(next);
    if (ser === lastSerializedRef.current) return;
    lastSerializedRef.current = ser;
    setAudit(next);
  }, []);

  const isTerminal =
    audit.status === "done" || audit.status === "failed";

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
            // On reconstruit un objet complet en mergeant l'état précédent
            updateIfChanged({
              ...audit,
              ...row,
            } as AuditStatusResponse);
          }
        )
        .subscribe();
    } catch {
      // Si Realtime n'est pas activé, le polling prend le relais.
    }
    return () => {
      if (channel) sb.removeChannel(channel);
    };
    // On veut un seul subscribe par audit id — on ne re-subscribe pas
    // sur chaque changement de `audit`. L'effet ci-dessous lit `audit`
    // via la fermeture mais c'est sans risque (on ne fait que merge).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit.id, isTerminal]);

  // ---- Timeout 10 min : on n'arrête pas l'attente, on rassure ----
  React.useEffect(() => {
    if (isTerminal) return;
    const startedAtMs = new Date(audit.created_at).getTime();
    const elapsed = Date.now() - startedAtMs;
    const remaining = TIMEOUT_MS - elapsed;
    if (remaining <= 0) {
      setShowTimeoutNote(true);
      return;
    }
    const id = window.setTimeout(() => setShowTimeoutNote(true), remaining);
    return () => window.clearTimeout(id);
  }, [audit.created_at, isTerminal]);

  const domain = prettyDomain(audit.url);
  const isFailed = audit.status === "failed";
  const isDone = audit.status === "done";

  return (
    <main className="min-h-screen bg-background py-8 sm:py-12">
      <Container size="narrow" className="space-y-8 sm:space-y-10">
        <ProgressHeader
          domain={domain}
          progress={isFailed ? audit.progress : isDone ? 100 : audit.progress}
          startedAt={audit.created_at}
          frozen={isTerminal}
        />

        {isFailed && <AuditFailedState errorMessage={audit.error_message} />}

        {isDone && <AuditDoneCta auditId={audit.id} />}

        {!isTerminal && (
          <>
            {showTimeoutNote && (
              <div
                className="rounded-2xl border border-warning/30 bg-warning/5 p-4 text-sm text-ankora-text"
                role="status"
              >
                L&apos;audit prend un peu plus de temps que prévu. Pas
                d&apos;inquiétude, on continue le travail — gardez l&apos;onglet
                ouvert.
              </div>
            )}
            <EngagementTip />
            <StepsList progress={audit.progress} />
          </>
        )}
      </Container>
    </main>
  );
}
