// =====================================================================
// <Verdict /> — bloc 2 du rapport : phrase choc en 1-2 lignes.
//
// Genere le verdict cote serveur (statique apres render) a partir des
// donnees agreges. Trois tonalites alignees sur le brief Bloc 5 :
//   - score < 40  : "invisible" — surprise + inquietude
//   - score 40-69 : "presence partielle" — competition mise en avant
//   - score >= 70 : "domination" — renforce la position, alerte montants
//
// On evite l'appel LLM ici : la phrase est templatee a partir des
// chiffres (mention_rate, top_competitor) — instantanee, deterministe,
// gratuit. Le verdict LLM reste produit pendant l'audit (synthesis)
// pour les recommandations.
// =====================================================================

import { scoreTone } from "@/lib/report/types";
import { cn } from "@/lib/utils";

type VerdictProps = {
  brandName: string;
  globalScore: number;
  mentionRate: number | null; // 0-100
  topCompetitor: string | null;
  totalQueries: number;
  brandMentionsCount: number;
};

// Calcule le pourcentage de visibilite a partir des chiffres bruts.
// Si mention_rate est null, on derive depuis les compteurs.
function computeVisibilityPct(
  mentionRate: number | null,
  brandMentions: number,
  totalQueries: number
): number {
  if (typeof mentionRate === "number" && Number.isFinite(mentionRate)) {
    return Math.round(mentionRate);
  }
  if (totalQueries > 0) {
    // Une query = 4 reponses (4 IA). On normalise sur queries pour la
    // narration "X questions sur 30".
    const responsesPerQuery = 4;
    const totalResponses = totalQueries * responsesPerQuery;
    return Math.round((brandMentions / Math.max(1, totalResponses)) * 100);
  }
  return 0;
}

export function Verdict({
  brandName,
  globalScore,
  mentionRate,
  topCompetitor,
  totalQueries,
  brandMentionsCount,
}: VerdictProps) {
  const tone = scoreTone(globalScore);
  const visibilityPct = computeVisibilityPct(
    mentionRate,
    brandMentionsCount,
    totalQueries
  );
  // % d'invisibilite = complement
  const invisibilityPct = Math.max(0, 100 - visibilityPct);

  // Genere la phrase selon le tier
  const sentence = (() => {
    const competitorMention = topCompetitor
      ? ` Et ${topCompetitor} prend votre place.`
      : "";
    if (tone === "low") {
      return `${brandName} est invisible pour ${invisibilityPct}% des clients qui vous cherchent via une IA.${competitorMention}`;
    }
    if (tone === "medium") {
      return `${brandName} apparaît dans ${visibilityPct}% des recherches IA — mais ${
        topCompetitor ?? "vos concurrents"
      } vous devancent sur les autres.`;
    }
    return `${brandName} domine ${visibilityPct}% des recherches IA. Surveillez ${
      topCompetitor ?? "les concurrents"
    } qui montent en puissance.`;
  })();

  return (
    <section
      className={cn(
        "mx-auto max-w-3xl text-center",
        // Couleur du texte tres legerement alignee sur le ton, mais on
        // garde l'indigo profond comme couleur principale pour le contraste
      )}
      aria-label="Verdict de l'audit"
    >
      <p className="font-display text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight tracking-tight text-ankora-ink">
        {sentence}
      </p>
    </section>
  );
}
