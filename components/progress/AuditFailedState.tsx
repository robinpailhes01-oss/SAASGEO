"use client";

import Link from "next/link";
import { AlertOctagon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// =====================================================================
// <AuditFailedState /> — UI de repli quand status === "failed".
//
// Affiche un message clair en français, deux actions (Réessayer + Nous
// contacter), et le détail technique (error_message) replié dans un
// <details> pour les utilisateurs avancés.
// =====================================================================

type AuditFailedStateProps = {
  errorMessage: string | null;
};

export function AuditFailedState({ errorMessage }: AuditFailedStateProps) {
  return (
    <Card className="border-destructive/30">
      <CardContent className="pt-7 pb-6 text-center">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertOctagon className="h-6 w-6" aria-hidden="true" />
        </div>

        <h2 className="mt-5 font-display text-xl font-semibold text-ankora-text">
          L&apos;audit n&apos;a pas pu aboutir
        </h2>
        <p className="mt-2 text-sm text-ankora-text-soft max-w-md mx-auto">
          Quelque chose s&apos;est mal passé pendant l&apos;analyse. C&apos;est
          rare et de notre côté — vous pouvez relancer un audit ou nous écrire.
        </p>

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button asChild variant="gradient" size="lg">
            <Link href="/">Réessayer un audit</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href="mailto:contact@robinpailhes.fr">Nous contacter</a>
          </Button>
        </div>

        {errorMessage && (
          <details className="mt-6 text-left">
            <summary className="cursor-pointer text-xs text-ankora-text-muted hover:text-primary">
              Détail technique
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-secondary p-3 text-xs text-ankora-text-soft font-mono whitespace-pre-wrap">
              {errorMessage}
            </pre>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
