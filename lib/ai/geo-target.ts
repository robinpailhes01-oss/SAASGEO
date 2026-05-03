// =====================================================================
// geo-target — parsing pragmatique d'une saisie utilisateur libre.
//
// L'utilisateur saisit sa ville depuis le formulaire d'audit ; on
// recoit en backend une chaine arbitraire. Le parser extrait :
//   - city           : ville exacte (Carnon)
//   - region         : departement / region si mentionnee (Hérault)
//   - city_main_hint : grande ville de reference si mentionnee
//                      explicitement par le user (Montpellier)
//
// 5 formats supportes (BUG terrain : "Carnon - Montpellier" donnait
// region=Montpellier au lieu de city_main=Montpellier) :
//   1) "Carnon"                           -> city=Carnon
//   2) "Carnon, Hérault"                  -> city=Carnon, region=Hérault
//   3) "Carnon, Montpellier"              -> city=Carnon, city_main_hint=Montpellier
//      (Montpellier est dans MAJOR_CITIES_FR -> traite comme ville reference)
//   4) "Carnon - Montpellier"             -> meme (tiret/em-dash supportes)
//      "Carnon / Montpellier"             -> meme (slash supporte)
//      "Carnon | Montpellier"             -> meme
//   5) "Carnon (Montpellier)"             -> city=Carnon, city_main_hint=Montpellier
//   6) "Carnon pres de Montpellier"       -> meme (proximite naturelle)
//      "Carnon proche Montpellier"        -> meme
//      "Carnon a cote de Montpellier"     -> meme
//
// Le second segment est confronte a MAJOR_CITIES_FR (>50k hab) :
//   - match -> city_main_hint
//   - no match -> region
//
// Tests dans __tests__/geo-target.test.ts.
// =====================================================================

import { MAJOR_CITIES_FR } from "./major-cities";

export type ParsedGeoTarget = {
  city: string;
  region: string | null;
  city_main_hint: string | null;
};

const SEPARATORS = /[,\-–—|/·]/;

// Pattern proximite : capture "X pres de Y", "X proche de Y",
// "X a cote de Y", insensible a la casse / accents partiels.
const PROXIMITY_RE =
  /^(.+?)\s+(?:pr[èe]s\s+de|proche\s+de?|[àa]\s+c[ôo]t[ée]\s+de|aupr[èe]s\s+de)\s+(.+)$/i;

// Pattern parentheses : "X (Y)" ou Y est un complement geo.
const PAREN_RE = /^(.+?)\s*\(([^()]+)\)\s*$/;

const MAJOR_CITY_NAMES = new Set(
  MAJOR_CITIES_FR.map((c) => c.name.toLowerCase().trim())
);

function isMajorCity(name: string): boolean {
  return MAJOR_CITY_NAMES.has(name.toLowerCase().trim());
}

// Determine si le segment "after" est une grande ville (-> city_main_hint)
// ou une region/departement (-> region). Retourne le tuple structure.
function classifySecondSegment(after: string): {
  region: string | null;
  city_main_hint: string | null;
} {
  if (!after) return { region: null, city_main_hint: null };
  if (isMajorCity(after)) {
    return { region: null, city_main_hint: after };
  }
  return { region: after, city_main_hint: null };
}

/**
 * Parse une saisie utilisateur en {city, region, city_main_hint}.
 *
 * - "Carnon"                       -> { city: "Carnon", region: null, city_main_hint: null }
 * - "Carnon, Hérault"              -> { city: "Carnon", region: "Hérault", city_main_hint: null }
 * - "Carnon, Montpellier"          -> { city: "Carnon", region: null, city_main_hint: "Montpellier" }
 * - "Carnon - Montpellier"         -> idem (tiret)
 * - "Carnon / Montpellier"         -> idem (slash)
 * - "Carnon (Montpellier)"         -> idem (parentheses)
 * - "Carnon près de Montpellier"   -> idem (proximite)
 * - "  carnon  "                   -> { city: "carnon", region: null, city_main_hint: null }
 *
 * Si l'input est vide, renvoie city="" + region=null + city_main_hint=null.
 */
export function parseUserGeoTarget(input: string): ParsedGeoTarget {
  const trimmed = input.trim();
  if (!trimmed) return { city: "", region: null, city_main_hint: null };

  // 1) Pattern proximite : "Carnon pres de Montpellier"
  const proxMatch = trimmed.match(PROXIMITY_RE);
  if (proxMatch) {
    const before = proxMatch[1].trim();
    const after = proxMatch[2].trim();
    return {
      city: before || trimmed,
      ...classifySecondSegment(after),
    };
  }

  // 2) Pattern parentheses : "Carnon (Montpellier)"
  const parenMatch = trimmed.match(PAREN_RE);
  if (parenMatch) {
    const before = parenMatch[1].trim();
    const inside = parenMatch[2].trim();
    return {
      city: before || trimmed,
      ...classifySecondSegment(inside),
    };
  }

  // 3) Separateurs simples : virgule / tiret / em-dash / slash / pipe
  const idx = trimmed.search(SEPARATORS);
  if (idx === -1) {
    return { city: trimmed, region: null, city_main_hint: null };
  }
  const before = trimmed.slice(0, idx).trim();
  const after = trimmed.slice(idx + 1).trim();
  return {
    city: before || trimmed,
    ...classifySecondSegment(after),
  };
}
