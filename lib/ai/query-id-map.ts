// =====================================================================
// query-id-map — type et helper defensif pour le mapping
// local_query_id -> supabase_query_id, partage entre les steps du
// pipeline d'audit.
//
// Pourquoi ce module existe :
//
//   Inngest serialise/deserialise les outputs de step.run() via JSON
//   pour rendre les checkpoints durables. Un Map JS n'est PAS
//   JSON-serialisable : `JSON.stringify(new Map([['a', 'b']]))` retourne
//   "{}" — le Map devient un objet vide a la deserialisation, et tout
//   appel ulterieur a `.entries()`, `.get()`, etc. plante avec
//   "TypeError: x.entries is not a function".
//
// Solution :
//   1. Le type partage entre steps est `QueryIdMap = Record<string,
//      string>` — un plain object naturellement JSON-friendly.
//   2. `toQueryIdMap(input)` accepte defensivement Map | Record |
//      array de tuples | null/undefined et retourne toujours un
//      Record. Utilise a la frontiere des steps pour absorber tout
//      legacy code qui passerait encore un Map.
// =====================================================================

export type QueryIdMap = Record<string, string>;

/**
 * Normalise n'importe quelle structure de mapping query_id en
 * `Record<string, string>` JSON-serialisable.
 *
 * Cas geres :
 *   - Map<string, string>          : converti via Object.fromEntries
 *   - Record<string, string>       : retourne une copie defensive
 *   - Array<[string, string]>      : converti via Object.fromEntries
 *   - null / undefined / autre     : retourne {}
 *
 * Robuste aux valeurs non-string (ignorees silencieusement) pour
 * eviter de propager des donnees corrompues plus loin dans le
 * pipeline.
 */
export function toQueryIdMap(input: unknown): QueryIdMap {
  if (input == null) return {};

  // Cas 1 : Map JS (avant serialisation Inngest, ou code CLI)
  if (input instanceof Map) {
    const out: QueryIdMap = {};
    for (const [k, v] of input.entries()) {
      if (typeof k === "string" && typeof v === "string") {
        out[k] = v;
      }
    }
    return out;
  }

  // Cas 2 : array de tuples (autre forme post-serialisation)
  if (Array.isArray(input)) {
    const out: QueryIdMap = {};
    for (const entry of input) {
      if (
        Array.isArray(entry) &&
        entry.length === 2 &&
        typeof entry[0] === "string" &&
        typeof entry[1] === "string"
      ) {
        out[entry[0]] = entry[1];
      }
    }
    return out;
  }

  // Cas 3 : plain object (le cas nominal post-fix)
  if (typeof input === "object") {
    const out: QueryIdMap = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  }

  // Cas 4 : tout autre input (number, string, boolean...) -> map vide
  return {};
}

/**
 * Lookup defensive : equivalent de `map.get(key) ?? key` mais sur un
 * QueryIdMap. Si la cle n'est pas trouvee, retourne `key` lui-meme
 * (assume qu'on passe deja un id Supabase, fallback sain pour les
 * chemins ou la table queries n'a pas ete persistee).
 */
export function lookupQueryId(map: QueryIdMap, key: string): string {
  const v = map[key];
  return typeof v === "string" ? v : key;
}
