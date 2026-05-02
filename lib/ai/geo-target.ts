// =====================================================================
// geo-target — parsing pragmatique d'une saisie utilisateur libre.
//
// L'utilisateur saisit sa ville depuis le formulaire d'audit ; on
// recoit en backend une chaine arbitraire (ex: "Carnon", "Carnon,
// Hérault", "Paris 8e", "Lyon (69)"). Ce module la decoupe en
// {city, region} de maniere defensive — pas de regex magique, juste
// un split sur le premier separateur courant.
//
// Tests dans __tests__/geo-target.test.ts.
// =====================================================================

export type ParsedGeoTarget = {
  city: string;
  region: string | null;
};

const SEPARATORS = /[,\-–—|·]/;

/**
 * Parse une saisie utilisateur en {city, region}.
 *
 * - "Carnon"            -> { city: "Carnon", region: null }
 * - "Carnon, Hérault"   -> { city: "Carnon", region: "Hérault" }
 * - "Paris - 8e"        -> { city: "Paris", region: "8e" }
 * - "  carnon  "        -> { city: "carnon", region: null } (trim)
 *
 * Si l'input est vide ou whitespace, renvoie city="" + region=null.
 * Le caller doit verifier que city.length > 0 avant de l'utiliser.
 */
export function parseUserGeoTarget(input: string): ParsedGeoTarget {
  const trimmed = input.trim();
  if (!trimmed) return { city: "", region: null };

  const idx = trimmed.search(SEPARATORS);
  if (idx === -1) {
    return { city: trimmed, region: null };
  }

  const city = trimmed.slice(0, idx).trim();
  const region = trimmed.slice(idx + 1).trim();
  return {
    city: city || trimmed,
    region: region.length > 0 ? region : null,
  };
}
