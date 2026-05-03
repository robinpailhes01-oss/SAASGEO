// =====================================================================
// Tests parseUserGeoTarget — saisie utilisateur libre.
//
// Le parser distingue 3 cas pour le 2eme segment :
//   - region (ex: "Hérault", "8e", "Provence") -> region=...
//   - grande ville reference (ex: "Montpellier") -> city_main_hint=...
//   - rien                                       -> region=null
// =====================================================================

import { describe, expect, it } from "vitest";

import { parseUserGeoTarget } from "../geo-target";

describe("parseUserGeoTarget — formats simples", () => {
  it("parse une ville simple", () => {
    expect(parseUserGeoTarget("Carnon")).toEqual({
      city: "Carnon",
      region: null,
      city_main_hint: null,
    });
  });

  it("parse 'Ville, Region' (region inconnue dans MAJOR_CITIES_FR)", () => {
    expect(parseUserGeoTarget("Carnon, Hérault")).toEqual({
      city: "Carnon",
      region: "Hérault",
      city_main_hint: null,
    });
  });

  it("parse 'Ville - Detail' avec arrondissement", () => {
    expect(parseUserGeoTarget("Paris - 8e")).toEqual({
      city: "Paris",
      region: "8e",
      city_main_hint: null,
    });
  });

  it("parse 'Ville | Region'", () => {
    expect(parseUserGeoTarget("Lyon | Rhône")).toEqual({
      city: "Lyon",
      region: "Rhône",
      city_main_hint: null,
    });
  });

  it("trim les espaces autour des composants", () => {
    expect(parseUserGeoTarget("  Carnon  ,  Hérault  ")).toEqual({
      city: "Carnon",
      region: "Hérault",
      city_main_hint: null,
    });
  });

  it("retourne city='' pour input vide ou whitespace", () => {
    expect(parseUserGeoTarget("")).toEqual({
      city: "",
      region: null,
      city_main_hint: null,
    });
    expect(parseUserGeoTarget("   ")).toEqual({
      city: "",
      region: null,
      city_main_hint: null,
    });
  });
});

describe("parseUserGeoTarget — REGRESSION : ville majeure dans le 2e segment", () => {
  // Bug terrain : "Carnon - Montpellier" donnait region=Montpellier
  // (donc city_main resolu en Brest car Carnon seul tombe sur le mauvais
  // Carnon en Bretagne). La fix : detecte que le 2e segment est une
  // grande ville (MAJOR_CITIES_FR) et le classe en city_main_hint.

  it("'Carnon, Montpellier' -> city_main_hint=Montpellier (virgule)", () => {
    expect(parseUserGeoTarget("Carnon, Montpellier")).toEqual({
      city: "Carnon",
      region: null,
      city_main_hint: "Montpellier",
    });
  });

  it("'Carnon - Montpellier' -> city_main_hint=Montpellier (tiret) — REGRESSION BUG TERRAIN", () => {
    expect(parseUserGeoTarget("Carnon - Montpellier")).toEqual({
      city: "Carnon",
      region: null,
      city_main_hint: "Montpellier",
    });
  });

  it("'Carnon — Montpellier' -> city_main_hint=Montpellier (em-dash)", () => {
    expect(parseUserGeoTarget("Carnon — Montpellier")).toEqual({
      city: "Carnon",
      region: null,
      city_main_hint: "Montpellier",
    });
  });

  it("'Carnon / Montpellier' -> city_main_hint=Montpellier (slash)", () => {
    expect(parseUserGeoTarget("Carnon / Montpellier")).toEqual({
      city: "Carnon",
      region: null,
      city_main_hint: "Montpellier",
    });
  });

  it("'Carnon | Montpellier' -> city_main_hint=Montpellier (pipe)", () => {
    expect(parseUserGeoTarget("Carnon | Montpellier")).toEqual({
      city: "Carnon",
      region: null,
      city_main_hint: "Montpellier",
    });
  });

  it("'Carnon (Montpellier)' -> city_main_hint=Montpellier (parentheses)", () => {
    expect(parseUserGeoTarget("Carnon (Montpellier)")).toEqual({
      city: "Carnon",
      region: null,
      city_main_hint: "Montpellier",
    });
  });

  it("'Carnon près de Montpellier' -> city_main_hint=Montpellier", () => {
    expect(parseUserGeoTarget("Carnon près de Montpellier")).toEqual({
      city: "Carnon",
      region: null,
      city_main_hint: "Montpellier",
    });
  });

  it("'Carnon proche de Montpellier' -> city_main_hint=Montpellier", () => {
    expect(parseUserGeoTarget("Carnon proche de Montpellier")).toEqual({
      city: "Carnon",
      region: null,
      city_main_hint: "Montpellier",
    });
  });

  it("'Carnon a cote de Montpellier' -> city_main_hint=Montpellier (sans accent)", () => {
    expect(parseUserGeoTarget("Carnon a cote de Montpellier")).toEqual({
      city: "Carnon",
      region: null,
      city_main_hint: "Montpellier",
    });
  });

  it("case-insensitive sur la ville majeure : 'carnon - montpellier'", () => {
    // city garde la casse de l'input ; city_main_hint aussi (l'aval
    // normalise via toLowerCase pour la comparaison MAJOR_CITIES_FR).
    expect(parseUserGeoTarget("carnon - montpellier")).toEqual({
      city: "carnon",
      region: null,
      city_main_hint: "montpellier",
    });
  });
});

describe("parseUserGeoTarget — edge cases", () => {
  it("region=null si rien apres le separateur", () => {
    expect(parseUserGeoTarget("Marseille,")).toEqual({
      city: "Marseille",
      region: null,
      city_main_hint: null,
    });
    expect(parseUserGeoTarget("Marseille -  ")).toEqual({
      city: "Marseille",
      region: null,
      city_main_hint: null,
    });
  });

  it("garde la chaine entiere si seul separateur present sans contenu avant", () => {
    expect(parseUserGeoTarget(", Hérault")).toEqual({
      city: ", Hérault",
      region: "Hérault",
      city_main_hint: null,
    });
  });

  it("supporte les caracteres tires longs (em-dash)", () => {
    expect(parseUserGeoTarget("Aix — Provence")).toEqual({
      city: "Aix",
      region: "Provence",
      city_main_hint: null,
    });
  });

  it("ville majeure non reconnue (typo) -> traite comme region", () => {
    expect(parseUserGeoTarget("Carnon - Montepelier")).toEqual({
      city: "Carnon",
      region: "Montepelier",
      city_main_hint: null,
    });
  });
});
