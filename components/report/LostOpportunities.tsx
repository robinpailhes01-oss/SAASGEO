// =====================================================================
// <LostOpportunities /> — bloc 3 : perte chiffree business.
//
// Encadre subtil, fond legerement chaud quand le score est bas.
// L'objectif emotionnel est l'inquietude actionnable : "voici la perte
// concrete par jour si 100 personnes vous cherchent via une IA".
//
// Calcul pragmatique :
//   - X = nombre de questions ou la marque est citee (sur 30)
//   - opportunites_manquees_par_jour = (30 - X) / 30 * 100 si on suppose
//     100 recherches/jour
// On reste explicite sur l'hypothese ("si 100 personnes vous cherchent")
// pour ne pas survendre.
// =====================================================================

import { AlertTriangle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { scoreTone } from "@/lib/report/types";
import { cn } from "@/lib/utils";

type LostOpportunitiesProps = {
  globalScore: number;
  totalQueries: number; // generalement 30
  brandMentionsCount: number; // sur les 4 IA combinees
};

export function LostOpportunities({
  globalScore,
  totalQueries,
  brandMentionsCount,
}: LostOpportunitiesProps) {
  const tone = scoreTone(globalScore);

  // Nombre de questions distinctes ou la marque apparait au moins une
  // fois sur les 4 IA. On approxime via le total des mentions / 4.
  // Si mentions_count >= total_queries, on plafonne a total_queries.
  const queriesWithBrand = Math.min(
    totalQueries,
    Math.round(brandMentionsCount / 4)
  );
  const queriesWithoutBrand = Math.max(0, totalQueries - queriesWithBrand);

  // Hypothese pedagogique : 100 recherches/jour sur l'univers de queries
  const lostPerDay =
    totalQueries > 0
      ? Math.round((queriesWithoutBrand / totalQueries) * 100)
      : 0;

  return (
    <Card
      className={cn(
        "border",
        tone === "low" && "border-destructive/20 bg-destructive/5",
        tone === "medium" && "border-warning/20 bg-warning/5",
        tone === "high" && "border-ankora-border bg-card"
      )}
    >
      <CardContent className="pt-6 pb-6">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              tone === "low" && "bg-destructive/15 text-destructive",
              tone === "medium" && "bg-warning/15 text-warning",
              tone === "high" && "bg-success/15 text-success"
            )}
            aria-hidden="true"
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold uppercase tracking-wider text-ankora-text-muted">
              Opportunités manquées
            </p>
            <p className="mt-2 text-base sm:text-lg text-ankora-text leading-relaxed">
              Sur les{" "}
              <span className="font-mono font-semibold tabular-nums">
                {totalQueries}
              </span>{" "}
              questions que vos clients posent aux IA, vous n&apos;apparaissez
              que{" "}
              <span className="font-mono font-semibold tabular-nums">
                {queriesWithBrand}
              </span>{" "}
              fois. C&apos;est{" "}
              <span
                className={cn(
                  "font-mono font-bold tabular-nums",
                  tone === "low" && "text-destructive",
                  tone === "medium" && "text-warning",
                  tone === "high" && "text-success"
                )}
              >
                {lostPerDay}
              </span>{" "}
              opportunités manquées par jour si 100 personnes vous cherchent
              via une IA.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
