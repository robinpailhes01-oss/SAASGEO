import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Helper standard shadcn/ui : merge intelligent de classes Tailwind
// Utilise dans tous les composants UI pour combiner les classes par defaut
// avec celles passees en prop sans duplication.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format un montant en euros pour affichage UI
export function formatEur(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(amount);
}

// Format une date en francais (ex: "30 avril 2026")
export function formatDateFr(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}
