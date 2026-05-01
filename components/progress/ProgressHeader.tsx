"use client";

import * as React from "react";

import { Logo } from "@/components/layout/Logo";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// =====================================================================
// <ProgressHeader /> — en-tete de la page de progression.
//
// Affiche : logo Ankora, domaine en cours d'audit, timer mm:ss en
// temps reel, et une barre fine de progression avec le pourcentage.
//
// Le timer redemarre automatiquement a partir de `startedAt` (created_at
// de l'audit). On rafraichit toutes les secondes via setInterval.
// =====================================================================

type ProgressHeaderProps = {
  domain: string;
  progress: number;
  startedAt: string;
  // Quand l'audit est termine, on fige le timer
  frozen?: boolean;
};

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ProgressHeader({
  domain,
  progress,
  startedAt,
  frozen = false,
}: ProgressHeaderProps) {
  const startMs = React.useMemo(
    () => new Date(startedAt).getTime(),
    [startedAt]
  );

  // Timer "live" — actualise a chaque seconde tant que l'audit n'est
  // pas termine. Une fois fige, on arrete l'interval pour economiser.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (frozen) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [frozen]);

  const elapsed = formatDuration(now - startMs);
  const pct = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Logo size="sm" />
        <span
          className={cn(
            "font-mono text-sm tabular-nums text-ankora-text-soft",
            frozen && "text-success"
          )}
          aria-label={`Durée écoulée : ${elapsed}`}
        >
          {elapsed}
        </span>
      </div>

      <div>
        <p className="text-sm text-ankora-text-soft">Audit en cours pour</p>
        <p className="mt-1 font-display text-xl sm:text-2xl font-semibold text-ankora-text break-all">
          {domain}
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-ankora-text-muted">
            Avancement
          </span>
          <span className="font-mono text-sm font-semibold text-primary tabular-nums">
            {pct}%
          </span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>
    </div>
  );
}
