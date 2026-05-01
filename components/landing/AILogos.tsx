// =====================================================================
// <AILogos /> — bandeau des 4 IA interrogees par Ankora.
//
// Affichage : 4 marques en ligne (desktop) / 2x2 (mobile), grayscale par
// defaut, couleur de marque au hover. On utilise des picto abstraits
// (pas les vrais logos, qui sont des marques deposees) accompagnes du
// wordmark en texte — usage nominatif clair.
//
// Picto = une pastille degradee a la couleur officielle de la marque,
// en effet "lueur". Resultat : reconnaissable sans copier le logo,
// passe le contrast AA en grayscale, scalable a 100%.
// =====================================================================

import { cn } from "@/lib/utils";

type AIBrand = {
  name: string;
  brandColor: string;
};

// Couleurs officielles connues publiquement (Brandfetch, About pages)
const brands: AIBrand[] = [
  { name: "ChatGPT", brandColor: "#10A37F" },
  { name: "Claude", brandColor: "#D97757" },
  { name: "Perplexity", brandColor: "#20808D" },
  { name: "Gemini", brandColor: "#4285F4" },
];

export function AILogos({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-6", className)}>
      <p className="text-sm font-medium text-ankora-text-soft">
        Nous interrogeons en votre nom :
      </p>
      <ul
        className="grid grid-cols-2 gap-x-10 gap-y-6 sm:grid-cols-4 sm:gap-x-12"
        aria-label="IA interrogées par Ankora"
      >
        {brands.map((brand) => (
          <li
            key={brand.name}
            className="group flex items-center justify-center gap-2.5 text-ankora-text-muted transition-colors hover:[color:var(--brand-color)]"
            style={{ ["--brand-color" as string]: brand.brandColor }}
          >
            {/* Pastille generique : disque grayscale -> degrade brand au hover */}
            <span
              className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ankora-border transition-all group-hover:bg-[var(--brand-color)] group-hover:shadow-[0_0_12px_var(--brand-color)]"
              aria-hidden="true"
            >
              <span className="block h-2 w-2 rounded-full bg-white" />
            </span>
            <span className="font-display text-base font-semibold tracking-tight">
              {brand.name}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
