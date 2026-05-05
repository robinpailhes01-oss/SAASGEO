// =====================================================================
// evolution-helpers — pures fonctions reutilisables pour le calcul des
// snapshots historiques et des deltas "vs precedent".
//
// SEPARE des fichiers backend (no DB import) pour pouvoir etre teste
// sans mock Supabase. Importe depuis persistence + get-report.
// =====================================================================

import type { Database } from "@/lib/supabase/types";

type QueryRow = {
  id: string;
  text: string;
  category: Database["public"]["Enums"]["query_category"];
};

// Normalise un texte de query pour matching exact entre 2 audits.
// Lowercase + trim + collapse multiple whitespace en single space.
// Permet d'absorber les variations cosmetiques sans rater les vrais
// matches.
//
// "  Meilleur HOTEL  Paris  " -> "meilleur hotel paris"
export function normalizeQueryText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

// Calcule la presence par categorie a partir des analyses.
// Une query "compte" si AU MOINS UNE des 4 IA cite la marque.
// Maximum 10 par categorie (sur les 30 queries 'generated' standard).
export function computePresenceByCategory(args: {
  queries: QueryRow[];
  // Analyses indexees par response_id, chaque analyse pointe vers son
  // response qui pointe vers son query_id.
  responsesByQueryId: Map<string, Array<{ brand_mentioned: boolean | null }>>;
}): {
  branded: number;
  service: number;
  comparative: number;
} {
  const result = { branded: 0, service: 0, comparative: 0 };
  for (const q of args.queries) {
    const responses = args.responsesByQueryId.get(q.id) ?? [];
    const isMentioned = responses.some((a) => a.brand_mentioned === true);
    if (isMentioned) {
      if (q.category === "branded") result.branded += 1;
      else if (q.category === "service") result.service += 1;
      else if (q.category === "comparative") result.comparative += 1;
    }
  }
  return result;
}

// Construit la liste des `cited_queries` pour le snapshot historique :
// queries dont AU MOINS UNE IA cite la marque, normalisees.
export function buildCitedQueriesList(args: {
  queries: QueryRow[];
  responsesByQueryId: Map<string, Array<{ brand_mentioned: boolean | null }>>;
}): string[] {
  const cited: string[] = [];
  for (const q of args.queries) {
    const responses = args.responsesByQueryId.get(q.id) ?? [];
    if (responses.some((a) => a.brand_mentioned === true)) {
      cited.push(normalizeQueryText(q.text));
    }
  }
  return cited;
}

// Delta entre 2 snapshots cited_queries.
//
// Strategie : matching par text_normalized exact. Si les query texts
// ont change drastiquement entre 2 audits (LLM a regenere autrement),
// on aura tres peu de matches communs. Le seuil MIN_OVERLAP filtre
// ces cas pour eviter d'afficher "vous avez perdu 30 requetes" alors
// que c'est juste un re-roll LLM. Si overlap < seuil, on retourne
// `null` pour ce delta — le rapport affichera "comparaison non
// disponible (questions trop differentes)".
const MIN_OVERLAP_FOR_DELTA = 5;

export type QueriesDelta = {
  gained: string[]; // cite dans courant, pas dans precedent
  lost: string[]; // cite dans precedent, pas dans courant
} | null;

export function computeQueriesDelta(
  currentCited: string[],
  previousCited: string[],
  // Liste TOTALE des queries du courant (normalisees) — sert a
  // calculer l'overlap pour le seuil MIN_OVERLAP.
  currentAllNormalized: string[],
  previousAllNormalized: string[]
): QueriesDelta {
  const previousSet = new Set(previousCited);
  const currentSet = new Set(currentCited);

  // Calcul de l'overlap brut entre les ensembles totaux de queries
  // (pas seulement les citees) — c'est ce qui valide la comparabilite
  // des 2 audits.
  const previousAllSet = new Set(previousAllNormalized);
  const overlap = currentAllNormalized.filter((q) => previousAllSet.has(q))
    .length;
  if (overlap < MIN_OVERLAP_FOR_DELTA) {
    return null;
  }

  // gained = courant \ precedent (mais doit aussi etre dans previousAll
  // pour qu'on sache que ce n'est pas juste une nouvelle question)
  const gained = currentCited.filter(
    (q) => !previousSet.has(q) && previousAllSet.has(q)
  );
  // lost = precedent \ courant (doit etre dans currentAll)
  const currentAllSet = new Set(currentAllNormalized);
  const lost = previousCited.filter(
    (q) => !currentSet.has(q) && currentAllSet.has(q)
  );

  return { gained, lost };
}
