"use client";

import { Toaster as SonnerToaster, toast } from "sonner";

// <Toaster /> — wrapper sonner aux couleurs Ankora.
// A monter une fois dans le layout racine.
// L'helper `toast` est re-exporte pour eviter d'importer sonner ailleurs.
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "rounded-2xl border border-ankora-border bg-card text-card-foreground shadow-ankora-card",
          title: "font-display text-sm font-semibold text-ankora-text",
          description: "text-sm text-ankora-text-soft",
        },
      }}
    />
  );
}

export { toast };
