import Link from "next/link";

import { cn } from "@/lib/utils";

// =====================================================================
// <Logo /> — wordmark Ankora.
//
// Compose un petit pictogramme "ancre" (degrade signature) et le nom
// de la marque en font display. Lien optionnel vers la home.
//
// Pictogramme volontairement simple (un triangle inverse + barre) pour
// rester lisible a 24px. On evite les SVG complexes qui detonnent dans
// le header epure.
// =====================================================================

type LogoProps = {
  className?: string;
  // Si false, rend un <span> non-cliquable (utile dans le header de la
  // page landing pour eviter une nav inutile sur soi-meme)
  asLink?: boolean;
  // Taille en variantes (alignees sur la hierarchie typo)
  size?: "sm" | "md" | "lg";
};

export function Logo({ className, asLink = true, size = "md" }: LogoProps) {
  const textClass =
    size === "sm"
      ? "text-base"
      : size === "lg"
        ? "text-2xl"
        : "text-xl";

  const iconSize = size === "sm" ? 18 : size === "lg" ? 28 : 22;

  const content = (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {/* Pictogramme : losange degrade — evoque l'ancre stylisee */}
      <span
        className="inline-block rounded-md bg-ankora-gradient"
        style={{
          width: iconSize,
          height: iconSize,
          maskImage:
            "linear-gradient(135deg, black 60%, transparent 60%), linear-gradient(45deg, black 60%, transparent 60%)",
          WebkitMaskImage:
            "linear-gradient(135deg, black 60%, transparent 60%), linear-gradient(45deg, black 60%, transparent 60%)",
        }}
        aria-hidden="true"
      />
      <span
        className={cn(
          "font-display font-semibold tracking-tight text-ankora-text",
          textClass
        )}
      >
        Ankora
      </span>
    </span>
  );

  if (!asLink) return content;
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
      aria-label="Ankora — accueil"
    >
      {content}
    </Link>
  );
}
