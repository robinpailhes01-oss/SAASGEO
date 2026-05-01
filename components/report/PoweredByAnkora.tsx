import * as React from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";

// =====================================================================
// <PoweredByAnkora /> — mini-bloc bonus, tres discret en bas de rapport.
//
// Renforce la marque sans nuire a l'experience. Lien vers la landing
// pour le client qui partage le rapport (effet de viralite secondaire).
// =====================================================================

export function PoweredByAnkora() {
  return (
    <p className="text-center text-xs text-ankora-text-muted flex items-center justify-center gap-1.5">
      <Sparkles className="h-3.5 w-3.5 text-primary/70" aria-hidden="true" />
      Audit propulsé par{" "}
      <Link
        href="/"
        className="font-semibold text-ankora-text hover:text-primary transition-colors"
      >
        Ankora
      </Link>{" "}
      — l&apos;outil d&apos;audit IA spécialisé tourisme et hôtellerie
    </p>
  );
}
