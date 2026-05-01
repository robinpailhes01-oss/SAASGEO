// =====================================================================
// Tests des helpers purs du module report.
//
// Couvre :
//   - scoreTone : seuils (39 -> low, 40 -> medium, 69 -> medium, 70 -> high)
//   - normalizeCompetitorKey : casse, prefixes URL, suffixes de domaine
// =====================================================================

import { describe, expect, it } from "vitest";

import { normalizeCompetitorKey, scoreTone } from "../types";

describe("scoreTone", () => {
  it("retourne 'low' pour les scores < 40", () => {
    expect(scoreTone(0)).toBe("low");
    expect(scoreTone(39)).toBe("low");
    expect(scoreTone(39.99)).toBe("low");
  });

  it("retourne 'medium' pour les scores 40-69", () => {
    expect(scoreTone(40)).toBe("medium");
    expect(scoreTone(55)).toBe("medium");
    expect(scoreTone(69)).toBe("medium");
  });

  it("retourne 'high' pour les scores >= 70", () => {
    expect(scoreTone(70)).toBe("high");
    expect(scoreTone(100)).toBe("high");
  });
});

describe("normalizeCompetitorKey", () => {
  it("normalise la casse", () => {
    expect(normalizeCompetitorKey("Stripe")).toBe(normalizeCompetitorKey("stripe"));
    expect(normalizeCompetitorKey("STRIPE")).toBe("stripe");
  });

  it("retire le prefixe www. et https://", () => {
    expect(normalizeCompetitorKey("https://stripe.com")).toBe("stripe");
    expect(normalizeCompetitorKey("www.stripe.com")).toBe("stripe");
    expect(normalizeCompetitorKey("Stripe")).toBe("stripe");
  });

  it("retire les TLD courants", () => {
    expect(normalizeCompetitorKey("doctolib.fr")).toBe("doctolib");
    expect(normalizeCompetitorKey("notion.so")).toBe("notion.so"); // .so non liste : preserve
    expect(normalizeCompetitorKey("openai.com")).toBe("openai");
    expect(normalizeCompetitorKey("airbnb.io")).toBe("airbnb");
  });

  it("regroupe les variantes d'un meme concurrent", () => {
    const variants = ["Stripe", "stripe.com", "https://stripe.com", "STRIPE"];
    const keys = new Set(variants.map(normalizeCompetitorKey));
    expect(keys.size).toBe(1);
  });

  it("trim les espaces", () => {
    expect(normalizeCompetitorKey("  Stripe  ")).toBe("stripe");
  });
});
