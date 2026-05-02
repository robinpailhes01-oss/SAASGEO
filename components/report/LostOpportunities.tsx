// =====================================================================
// <LostOpportunities /> — bloc 3 : "Manque a gagner".
//
// V2 (refonte langage business) : narrative ville + secteur + ratio
// 33/67 + concurrents/jour. Objectif : que le client comprenne en 5
// secondes COMBIEN il perd ET COMMENT (pas un chiffre abstrait).
//
// Format :
//   "Si 100 personnes cherchent un [secteur] a [ville_reference] via
//    une IA ce mois-ci :
//     -> 33 vous trouvent
//     -> 67 vont chez un concurrent
//    Vos concurrents captent ~2 recherches par jour a votre place."
//
// Pourquoi pas le score : "27/100" ne parle pas a un commercant local.
// "67 personnes vont chez un concurrent par mois" oui.
//
// On garde l'icone d'alerte + couleur dynamique selon le ton (low/
// medium/high reflete l'ampleur du manque a gagner).
// =====================================================================

import { AlertTriangle, ArrowRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { scoreTone } from "@/lib/report/types";
import { cn } from "@/lib/utils";

type LostOpportunitiesProps = {
  globalScore: number;
  totalQueries: number; // generalement 30
  brandMentionsCount: number; // sur les 4 IA combinees (max 120)
  // Localisation pour personnaliser la phrase principale
  cityMain?: string | null; // grande ville de reference (Montpellier)
  city?: string | null;     // ville exacte (Carnon)
  industry?: string | null; // ex: "Hotellerie", "Charter de yacht"
};

// Calcul de "vous trouvent / ne vous trouvent pas" sur une base 100 :
// proxy = nombre de reponses ou brand_mentioned=true / total_responses.
// Plus precis que diviser par totalQueries car couvre les 120 responses.
function computeFoundPct(
  totalQueries: number,
  brandMentionsCount: number
): number {
  const totalResponses = Math.max(1, totalQueries * 4);
  return Math.max(0, Math.min(100, Math.round((brandMentionsCount / totalResponses) * 100)));
}

// Estimation pedagogique : si 100 personnes/mois cherchent ce type
// d'activite a cet endroit, X vont chez un concurrent. Reparti sur
// 30 jours = X/30 par jour. Plafonne a 1 minimum (pour eviter "0 par
// jour" qui dilue le message si le score est tres haut).
function estimatePerDay(missingPct: number): number {
  const monthlyLost = missingPct; // hypothese 100 recherches/mois
  return Math.max(1, Math.round(monthlyLost / 30));
}

// Construit le label d'activite court pour la phrase narrative.
// "Charter de yacht" -> "charter", "Hotellerie de luxe" -> "hotel",
// fallback "service" si pas de signal clair.
function shortenIndustry(industry: string | null | undefined): string {
  if (!industry || industry.trim().length === 0) return "service";
  const lower = industry.toLowerCase();
  // Heuristiques simples pour les secteurs courants
  if (lower.includes("hotel") || lower.includes("hôtel")) return "hôtel";
  if (lower.includes("restaurant")) return "restaurant";
  if (lower.includes("yacht") || lower.includes("charter")) return "charter";
  if (lower.includes("immobilier")) return "agence immobilière";
  if (lower.includes("garage") || lower.includes("auto")) return "garage";
  if (lower.includes("coiffure") || lower.includes("salon")) return "salon de coiffure";
  if (lower.includes("avocat")) return "cabinet d'avocats";
  if (lower.includes("medecin") || lower.includes("médecin")) return "médecin";
  // Fallback : on garde le mot principal (jusqu'au premier separateur)
  const firstWord = industry.split(/[,;.]|\s-\s/)[0].trim().toLowerCase();
  return firstWord.length > 0 && firstWord.length < 40 ? firstWord : "service";
}

export function LostOpportunities({
  globalScore,
  totalQueries,
  brandMentionsCount,
  cityMain,
  city,
  industry,
}: LostOpportunitiesProps) {
  const tone = scoreTone(globalScore);
  const foundPct = computeFoundPct(totalQueries, brandMentionsCount);
  const missingPct = 100 - foundPct;
  const perDay = estimatePerDay(missingPct);

  // La ville de reference pour la phrase principale = city_main si
  // dispo (Montpellier), sinon city (Carnon), sinon vague ("votre zone").
  const locationLabel = cityMain || city || null;
  const activityLabel = shortenIndustry(industry);

  return (
    <Card
      className={cn(
        "border",
        tone === "low" && "border-destructive/20 bg-destructive/5",
        tone === "medium" && "border-warning/20 bg-warning/5",
        tone === "high" && "border-success/20 bg-success/5"
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
          <div className="min-w-0 flex-1 space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wider text-ankora-text-muted">
              Manque à gagner estimé
            </p>

            <p className="text-base sm:text-lg text-ankora-text leading-relaxed">
              Si{" "}
              <span className="font-semibold">100 personnes</span> cherchent
              {" "}
              {activityLabel === "service" ? "votre type de service" : `un ${activityLabel}`}
              {locationLabel ? (
                <>
                  {" "}à <span className="font-semibold">{locationLabel}</span>
                </>
              ) : null}
              {" "}via une IA ce mois-ci :
            </p>

            {/* Ratio 33/67 visuel */}
            <ul className="space-y-2 text-base sm:text-lg text-ankora-text">
              <li className="flex items-start gap-2.5">
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                <span>
                  <span className="font-mono font-bold tabular-nums text-success">
                    {foundPct}
                  </span>{" "}
                  vous trouvent
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <ArrowRight
                  className={cn(
                    "mt-1 h-4 w-4 shrink-0",
                    tone === "low" && "text-destructive",
                    tone === "medium" && "text-warning",
                    tone === "high" && "text-success"
                  )}
                  aria-hidden="true"
                />
                <span>
                  <span
                    className={cn(
                      "font-mono font-bold tabular-nums",
                      tone === "low" && "text-destructive",
                      tone === "medium" && "text-warning",
                      tone === "high" && "text-success"
                    )}
                  >
                    {missingPct}
                  </span>{" "}
                  vont chez un concurrent
                </span>
              </li>
            </ul>

            <p className="text-sm sm:text-base text-ankora-text-soft leading-relaxed">
              Vos concurrents captent{" "}
              <span
                className={cn(
                  "font-mono font-bold tabular-nums",
                  tone === "low" && "text-destructive",
                  tone === "medium" && "text-warning",
                  tone === "high" && "text-success"
                )}
              >
                ~{perDay}
              </span>{" "}
              {perDay === 1 ? "recherche" : "recherches"} par jour à votre place
              {locationLabel ? <> autour de {locationLabel}</> : null}.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
