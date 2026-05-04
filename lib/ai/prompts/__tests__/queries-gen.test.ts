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

describe("buildQueriesGenPrompt — REGRESSION langage CLIENT vs jargon SECTEUR", () => {
  // Bug terrain : "Meilleur charter Montpellier" ne reflete pas ce que
  // les vrais prospects cherchent ("location bateau Montpellier"). Le
  // system prompt impose desormais le LANGAGE CLIENT (location, sortie,
  // que faire, idee) plutot que le jargon professionnel (charter,
  // privatisation, prestations).
  const localBusiness: BusinessInfo = {
    brand_name: "Harmonie Yacht",
    brand_aliases: ["Harmonie Yacht"],
    industry: "Charter de yacht",
    services: ["Location", "Sortie en mer"],
    geo_zone: "Carnon, Hérault",
    city: "Carnon",
    city_main: "Montpellier",
    region: "Hérault",
    country: "France",
    business_scope: "local",
    detected_competitors: [],
    language: "fr",
  };

  it("system prompt impose la regle 'LANGAGE CLIENT, PAS LANGAGE SECTEUR'", () => {
    const { system } = buildQueriesGenPrompt(localBusiness);
    expect(system).toContain("LANGAGE CLIENT, PAS LANGAGE SECTEUR");
    expect(system).toContain("location bateau");
    expect(system).toContain("que faire");
  });

  it("system prompt liste les equivalents SECTEUR -> CLIENT", () => {
    const { system } = buildQueriesGenPrompt(localBusiness);
    // Quelques mappings explicites du tableau d'equivalents
    expect(system).toContain("charter de yacht");
    expect(system).toContain("location bateau");
    expect(system).toContain("ou dormir");
    expect(system).toContain("ou bien manger");
  });

  it("system prompt liste le vocabulaire client a privilegier", () => {
    const { system } = buildQueriesGenPrompt(localBusiness);
    // Mots du vocabulaire client recurrent
    expect(system).toContain("location");
    expect(system).toContain("sortie");
    expect(system).toContain("activite");
    expect(system).toContain("idee");
    expect(system).toContain("originale");
    expect(system).toContain("insolite");
  });

  it("system prompt rappelle le quota >= 3 requetes 'decouverte locale'", () => {
    const { system } = buildQueriesGenPrompt(localBusiness);
    expect(system).toContain("decouverte locale");
    expect(system).toContain("Que faire a");
  });

  it("LOCAL : strategy injecte le QUOTA OBLIGATOIRE 'decouverte locale'", () => {
    const { prompt } = buildQueriesGenPrompt(localBusiness);
    expect(prompt).toContain("QUOTA OBLIGATOIRE");
    expect(prompt).toContain("Que faire a Montpellier");
    expect(prompt).toContain("Idee originale Montpellier");
    expect(prompt).toContain("Activite insolite Montpellier");
  });

  it("LOCAL : exemple service MAIN affiche 'Location bateau' (langage client)", () => {
    const { prompt } = buildQueriesGenPrompt(localBusiness);
    // L'exemple sectoriel utilise "Location bateau" et NON "Meilleur charter"
    expect(prompt).toContain("Location bateau Montpellier");
    expect(prompt).toContain("langage CLIENT");
  });

  it("Keywords : block 'priorite editoriale forte' + 'LANGAGE DE LA VRAIE CIBLE'", () => {
    const { prompt } = buildQueriesGenPrompt(localBusiness, {
      keywords: ["romantique", "EVJF", "privatise"],
    });
    expect(prompt).toContain("MOTS-CLES CLIENT (priorite editoriale forte)");
    expect(prompt).toContain("LANGAGE DE LA VRAIE CIBLE");
    expect(prompt).toContain("romantique");
    expect(prompt).toContain("EVJF");
    expect(prompt).toContain("privatise");
    // Exemples d'integration concrets
    expect(prompt).toContain("Sortie en mer romantique Montpellier");
    expect(prompt).toContain("Idee EVJF originale Montpellier");
  });

  it("Keywords absents : pas de block keywords mais quota decouverte conserve", () => {
    const { prompt } = buildQueriesGenPrompt(localBusiness);
    expect(prompt).not.toContain("MOTS-CLES CLIENT");
    expect(prompt).toContain("QUOTA OBLIGATOIRE");
  });
});
