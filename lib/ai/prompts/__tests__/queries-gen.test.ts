// =====================================================================
// Tests de regression sur la strategie geo de queries-gen.
//
// On ne teste pas le LLM (cout). On verifie que le PROMPT contient
// les bonnes instructions geographiques selon le business_scope —
// si la strategie n'est pas dans le prompt, le LLM ne peut pas la
// suivre meme avec un modele parfait.
// =====================================================================

import { describe, expect, it } from "vitest";

import { buildQueriesGenPrompt } from "../queries-gen";
import type { BusinessInfo } from "../brand-extract";

const baseBusiness: BusinessInfo = {
  brand_name: "Harmonie Yacht",
  brand_aliases: ["Harmonie Yacht", "harmonie-yacht"],
  industry: "Charter de yachts",
  services: ["Location yacht", "Skippers"],
  geo_zone: "Carnon, Hérault",
  city: "Carnon",
  city_main: "Montpellier",
  region: "Hérault",
  country: "France",
  business_scope: "local",
  detected_competitors: ["Fraser Yachts"],
  language: "fr",
};

describe("buildQueriesGenPrompt — strategie geo", () => {
  it("LOCAL avec city_main : split 15/6/6/3 et city_main prioritaire", () => {
    const { prompt, system } = buildQueriesGenPrompt(baseBusiness);

    // Contexte business injecte (les deux niveaux)
    expect(prompt).toContain("Carnon");
    expect(prompt).toContain("Montpellier");
    expect(prompt).toContain("Hérault");

    // Strategie 15/6/6/3 obligatoire dans le prompt
    expect(prompt).toContain("STRATEGIE GEO — BUSINESS LOCAL");
    expect(prompt).toContain("15 questions");
    expect(prompt).toContain("6 questions");
    expect(prompt).toContain("3 questions");
    // city_main dominante : phrase qui explique la priorite
    expect(prompt).toContain("grande ville de reference");

    // Sanity : le system prompt rappelle de respecter la strategie
    expect(system).toContain("strategie geographique");
  });

  it("LOCAL sans city_main : fallback degrade gracieux (21/6/3)", () => {
    const business: BusinessInfo = {
      ...baseBusiness,
      city_main: null,
    };
    const { prompt } = buildQueriesGenPrompt(business);

    // city_main absent -> on duplique city dans MAIN
    expect(prompt).toContain("21 questions mentionnant");
    expect(prompt).toContain("Carnon");
  });

  it("NATIONAL : passe en mode sectoriel sans split 15/6/6/3", () => {
    const business: BusinessInfo = {
      ...baseBusiness,
      city: null,
      city_main: null,
      region: null,
      country: "France",
      business_scope: "national",
    };
    const { prompt } = buildQueriesGenPrompt(business);

    expect(prompt).toContain("STRATEGIE GEO — BUSINESS NATIONAL");
    // Pas de directive locale
    expect(prompt).not.toContain("15 questions mentionnant");
    expect(prompt).not.toContain("grande ville de reference");
  });

  it("INTERNATIONAL : pas de bias local", () => {
    const business: BusinessInfo = {
      ...baseBusiness,
      city: null,
      city_main: null,
      region: null,
      country: null,
      business_scope: "international",
    };
    const { prompt } = buildQueriesGenPrompt(business);

    expect(prompt).toContain("STRATEGIE GEO — BUSINESS INTERNATIONAL");
    expect(prompt).not.toContain("15 questions mentionnant");
  });

  it("LOCAL sans city detectee : fallback sur geo_zone", () => {
    const business: BusinessInfo = {
      ...baseBusiness,
      city: null,
      city_main: null,
      region: null,
      // geo_zone garde "Carnon, Hérault"
      business_scope: "local",
    };
    const { prompt } = buildQueriesGenPrompt(business);

    // On utilise geo_zone comme fallback de la ville
    expect(prompt).toContain("Carnon, Hérault");
    expect(prompt).toContain("STRATEGIE GEO — BUSINESS LOCAL");
  });

  it("Langue francaise : inclut l'instruction langue FR", () => {
    const { prompt } = buildQueriesGenPrompt(baseBusiness);
    expect(prompt).toContain("francais");
  });

  it("Langue anglaise : passe en EN", () => {
    const business: BusinessInfo = { ...baseBusiness, language: "en" };
    const { prompt } = buildQueriesGenPrompt(business);
    expect(prompt).toContain("English");
  });
});
