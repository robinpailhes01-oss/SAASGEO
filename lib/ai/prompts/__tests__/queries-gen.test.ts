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
  region: "Hérault",
  country: "France",
  business_scope: "local",
  detected_competitors: ["Fraser Yachts"],
  language: "fr",
};

describe("buildQueriesGenPrompt — strategie geo", () => {
  it("LOCAL : injecte la repartition 50/30/20 explicitement", () => {
    const { prompt, system } = buildQueriesGenPrompt(baseBusiness);

    // Contexte business injecte
    expect(prompt).toContain("Carnon");
    expect(prompt).toContain("Hérault");
    expect(prompt).toContain("local");

    // Strategie 50/30/20 obligatoire dans le prompt
    expect(prompt).toContain("STRATEGIE GEO — BUSINESS LOCAL");
    expect(prompt).toContain("5 questions LOCALES");
    expect(prompt).toContain("3 questions REGIONALES");
    expect(prompt).toContain("2 questions NATIONALES");
    expect(prompt).toContain("5 comparatives LOCALES");

    // Sanity : le system prompt rappelle de respecter la strategie
    expect(system).toContain("strategie geographique");
  });

  it("NATIONAL : passe en mode sectoriel sans 50/30/20", () => {
    const business: BusinessInfo = {
      ...baseBusiness,
      city: null,
      region: null,
      country: "France",
      business_scope: "national",
    };
    const { prompt } = buildQueriesGenPrompt(business);

    expect(prompt).toContain("STRATEGIE GEO — BUSINESS NATIONAL");
    // Pas de directive 50/30/20 — comportement original preserve
    expect(prompt).not.toContain("5 questions LOCALES");
    expect(prompt).not.toContain("3 questions REGIONALES");
  });

  it("INTERNATIONAL : pas de bias local", () => {
    const business: BusinessInfo = {
      ...baseBusiness,
      city: null,
      region: null,
      country: null,
      business_scope: "international",
    };
    const { prompt } = buildQueriesGenPrompt(business);

    expect(prompt).toContain("STRATEGIE GEO — BUSINESS INTERNATIONAL");
    expect(prompt).not.toContain("5 questions LOCALES");
  });

  it("LOCAL sans city detectee : fallback sur geo_zone", () => {
    const business: BusinessInfo = {
      ...baseBusiness,
      city: null,
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
