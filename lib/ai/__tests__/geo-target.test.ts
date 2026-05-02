// =====================================================================
// Tests parseUserGeoTarget — saisie utilisateur libre.
// =====================================================================

import { describe, expect, it } from "vitest";

import { parseUserGeoTarget } from "../geo-target";

describe("parseUserGeoTarget", () => {
  it("parse une ville simple", () => {
    expect(parseUserGeoTarget("Carnon")).toEqual({
      city: "Carnon",
      region: null,
    });
  });

  it("parse 'Ville, Region'", () => {
    expect(parseUserGeoTarget("Carnon, Hérault")).toEqual({
      city: "Carnon",
      region: "Hérault",
    });
  });

  it("parse 'Ville - Detail'", () => {
    expect(parseUserGeoTarget("Paris - 8e")).toEqual({
      city: "Paris",
      region: "8e",
    });
  });

  it("parse 'Ville | Region'", () => {
    expect(parseUserGeoTarget("Lyon | Rhône")).toEqual({
      city: "Lyon",
      region: "Rhône",
    });
  });

  it("trim les espaces autour des composants", () => {
    expect(parseUserGeoTarget("  Carnon  ,  Hérault  ")).toEqual({
      city: "Carnon",
      region: "Hérault",
    });
  });

  it("retourne city='' pour input vide ou whitespace", () => {
    expect(parseUserGeoTarget("")).toEqual({ city: "", region: null });
    expect(parseUserGeoTarget("   ")).toEqual({ city: "", region: null });
  });

  it("region=null si rien apres le separateur", () => {
    expect(parseUserGeoTarget("Marseille,")).toEqual({
      city: "Marseille",
      region: null,
    });
    expect(parseUserGeoTarget("Marseille -  ")).toEqual({
      city: "Marseille",
      region: null,
    });
  });

  it("garde la chaine entiere si seul separateur present sans contenu", () => {
    // "  ,  " -> trim donne ",", split sur "," -> city="" puis fallback
    // sur trimmed
    expect(parseUserGeoTarget(", Hérault")).toEqual({
      city: ", Hérault",
      region: "Hérault",
    });
  });

  it("supporte les caracteres tires longs (— —)", () => {
    expect(parseUserGeoTarget("Aix — Provence")).toEqual({
      city: "Aix",
      region: "Provence",
    });
  });
});
