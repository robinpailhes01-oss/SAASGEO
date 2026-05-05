// =====================================================================
// Tests evolution-helpers — pure logique snapshots et deltas.
// =====================================================================

import { describe, expect, it } from "vitest";

import {
  normalizeQueryText,
  computePresenceByCategory,
  buildCitedQueriesList,
  computeQueriesDelta,
} from "../evolution-helpers";

describe("normalizeQueryText", () => {
  it("lowercase + trim", () => {
    expect(normalizeQueryText("  Meilleur HOTEL Paris  ")).toBe(
      "meilleur hotel paris"
    );
  });

  it("collapse multiple spaces", () => {
    expect(normalizeQueryText("hotel    paris   8e")).toBe("hotel paris 8e");
  });

  it("preserves accents (cas FR)", () => {
    expect(normalizeQueryText("HÔTEL Hérault")).toBe("hôtel hérault");
  });

  it("identique apres normalisation pour 2 variantes cosmetiques", () => {
    const a = normalizeQueryText("Avis sur Harmonie Yacht");
    const b = normalizeQueryText("  AVIS  SUR HARMONIE YACHT ");
    expect(a).toBe(b);
  });
});

describe("computePresenceByCategory", () => {
  const queries = [
    { id: "q1", text: "Avis Hotel", category: "branded" as const },
    { id: "q2", text: "Que vaut Hotel", category: "branded" as const },
    { id: "q3", text: "Meilleur hotel Paris", category: "service" as const },
    { id: "q4", text: "Hotel pas cher", category: "service" as const },
    { id: "q5", text: "Top 5 hotels", category: "comparative" as const },
  ];

  it("compte les queries ou >=1 IA cite la marque, par categorie", () => {
    const responsesByQueryId = new Map<
      string,
      Array<{ brand_mentioned: boolean | null }>
    >();
    // q1 : 2/4 IA citent
    responsesByQueryId.set("q1", [
      { brand_mentioned: true },
      { brand_mentioned: false },
      { brand_mentioned: true },
      { brand_mentioned: false },
    ]);
    // q2 : 0/4 IA
    responsesByQueryId.set("q2", [
      { brand_mentioned: false },
      { brand_mentioned: false },
      { brand_mentioned: false },
      { brand_mentioned: false },
    ]);
    // q3 : 1/4 IA
    responsesByQueryId.set("q3", [
      { brand_mentioned: false },
      { brand_mentioned: true },
      { brand_mentioned: false },
      { brand_mentioned: false },
    ]);
    // q4 : pas d'analyses
    // q5 : 4/4 IA
    responsesByQueryId.set("q5", [
      { brand_mentioned: true },
      { brand_mentioned: true },
      { brand_mentioned: true },
      { brand_mentioned: true },
    ]);

    expect(
      computePresenceByCategory({ queries, responsesByQueryId })
    ).toEqual({
      branded: 1, // q1 oui, q2 non
      service: 1, // q3 oui, q4 absent
      comparative: 1, // q5 oui
    });
  });

  it("retourne 0/0/0 si aucune mention", () => {
    const responsesByQueryId = new Map<
      string,
      Array<{ brand_mentioned: boolean | null }>
    >();
    for (const q of queries) {
      responsesByQueryId.set(q.id, [{ brand_mentioned: false }]);
    }
    expect(
      computePresenceByCategory({ queries, responsesByQueryId })
    ).toEqual({ branded: 0, service: 0, comparative: 0 });
  });

  it("ignore les analyses brand_mentioned=null", () => {
    const responsesByQueryId = new Map<
      string,
      Array<{ brand_mentioned: boolean | null }>
    >();
    responsesByQueryId.set("q1", [
      { brand_mentioned: null },
      { brand_mentioned: null },
    ]);
    expect(
      computePresenceByCategory({ queries: queries.slice(0, 1), responsesByQueryId })
    ).toEqual({ branded: 0, service: 0, comparative: 0 });
  });
});

describe("buildCitedQueriesList", () => {
  it("renvoie les queries citees, normalisees", () => {
    const queries = [
      { id: "q1", text: "  Avis HOTEL  ", category: "branded" as const },
      { id: "q2", text: "Top hotels Paris", category: "comparative" as const },
    ];
    const responsesByQueryId = new Map<
      string,
      Array<{ brand_mentioned: boolean | null }>
    >();
    responsesByQueryId.set("q1", [{ brand_mentioned: true }]);
    responsesByQueryId.set("q2", [{ brand_mentioned: false }]);

    const result = buildCitedQueriesList({ queries, responsesByQueryId });
    expect(result).toEqual(["avis hotel"]);
  });
});

describe("computeQueriesDelta", () => {
  it("renvoie null si overlap < seuil (audits trop differents)", () => {
    const result = computeQueriesDelta(
      ["a", "b"],
      ["c", "d"],
      ["a", "b", "x"], // currentAll
      ["c", "d", "y"] // previousAll — 0 overlap
    );
    expect(result).toBeNull();
  });

  it("calcule gained/lost si overlap suffisant", () => {
    // 5 queries communes : "common1".."common5"
    const currentAll = [
      "common1",
      "common2",
      "common3",
      "common4",
      "common5",
      "new_query",
    ];
    const previousAll = [
      "common1",
      "common2",
      "common3",
      "common4",
      "common5",
      "old_query",
    ];
    const currentCited = ["common1", "common2", "new_query"];
    const previousCited = ["common2", "common3", "old_query"];

    const result = computeQueriesDelta(
      currentCited,
      previousCited,
      currentAll,
      previousAll
    );
    // gained = courant cite ET dans previousAll mais pas dans previousCited
    // -> "common1" (cite courant, pas cite avant)
    // "new_query" est exclu (pas dans previousAll = nouvelle query)
    expect(result?.gained).toEqual(["common1"]);
    // lost = previous cite ET dans currentAll mais pas dans currentCited
    // -> "common3" (etait cite, plus cite)
    // "old_query" exclu (pas dans currentAll)
    expect(result?.lost).toEqual(["common3"]);
  });

  it("aucune evolution = gained et lost vides", () => {
    const queries = [
      "common1",
      "common2",
      "common3",
      "common4",
      "common5",
    ];
    const result = computeQueriesDelta(
      ["common1", "common2"],
      ["common1", "common2"],
      queries,
      queries
    );
    expect(result).toEqual({ gained: [], lost: [] });
  });
});
