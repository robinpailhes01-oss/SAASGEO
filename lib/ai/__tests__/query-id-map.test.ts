// =====================================================================
// Tests de regression pour query-id-map.
//
// Couvre specifiquement le bug "TypeError: x.query_id_map.entries is
// not a function" survenu en production sur Inngest, du a la
// serialisation JSON d'un Map en {} entre les steps.
// =====================================================================

import { describe, expect, it } from "vitest";

import { toQueryIdMap, lookupQueryId, type QueryIdMap } from "../query-id-map";

describe("toQueryIdMap", () => {
  it("convertit un Map<string, string> en Record", () => {
    const m = new Map<string, string>([
      ["local-1", "uuid-1"],
      ["local-2", "uuid-2"],
    ]);
    expect(toQueryIdMap(m)).toEqual({
      "local-1": "uuid-1",
      "local-2": "uuid-2",
    });
  });

  it("retourne une copie d'un plain object", () => {
    const obj = { "local-1": "uuid-1" };
    const result = toQueryIdMap(obj);
    expect(result).toEqual(obj);
  });

  it("convertit un array de tuples [string, string][]", () => {
    const tuples: [string, string][] = [
      ["a", "1"],
      ["b", "2"],
    ];
    expect(toQueryIdMap(tuples)).toEqual({ a: "1", b: "2" });
  });

  it("retourne {} pour null", () => {
    expect(toQueryIdMap(null)).toEqual({});
  });

  it("retourne {} pour undefined", () => {
    expect(toQueryIdMap(undefined)).toEqual({});
  });

  it("retourne {} pour un type primitif inattendu (number, string, bool)", () => {
    expect(toQueryIdMap(42)).toEqual({});
    expect(toQueryIdMap("not a map")).toEqual({});
    expect(toQueryIdMap(true)).toEqual({});
  });

  it("ignore les valeurs non-string dans un objet (defense en profondeur)", () => {
    const corrupt = {
      good: "uuid",
      bad_number: 123,
      bad_null: null,
      bad_obj: { nested: true },
    } as unknown;
    expect(toQueryIdMap(corrupt)).toEqual({ good: "uuid" });
  });

  // ------------------------------------------------------------------
  // Test cle : reproduit le bug Inngest exactement
  // ------------------------------------------------------------------
  it("REGRESSION : un Map JSON.stringified devient {} et toQueryIdMap doit le tolerer", () => {
    const original = new Map<string, string>([
      ["local-1", "uuid-1"],
      ["local-2", "uuid-2"],
    ]);

    // Simule la serialisation Inngest (JSON.stringify d'un Map donne "{}")
    const serialized = JSON.stringify(original);
    expect(serialized).toBe("{}"); // confirmation du bug Inngest

    const deserialized = JSON.parse(serialized);
    // Avant le fix : deserialized.entries() -> TypeError
    // Apres le fix : toQueryIdMap retourne un {} valide
    expect(() => toQueryIdMap(deserialized)).not.toThrow();
    expect(toQueryIdMap(deserialized)).toEqual({});
  });

  it("REGRESSION : un Record JSON-roundtripped reste un Record valide", () => {
    const original: QueryIdMap = { "local-1": "uuid-1", "local-2": "uuid-2" };
    const roundtripped = JSON.parse(JSON.stringify(original));
    expect(toQueryIdMap(roundtripped)).toEqual(original);
  });
});

describe("lookupQueryId", () => {
  it("retourne la valeur si la cle existe", () => {
    expect(lookupQueryId({ a: "uuid-a" }, "a")).toBe("uuid-a");
  });

  it("retourne la cle elle-meme si absente (fallback sur supabase_id direct)", () => {
    expect(lookupQueryId({}, "supabase-uuid")).toBe("supabase-uuid");
  });

  it("retourne la cle elle-meme si la valeur est non-string (corruption)", () => {
    const corrupt = { a: 123 as unknown as string };
    expect(lookupQueryId(corrupt, "a")).toBe("a");
  });
});
