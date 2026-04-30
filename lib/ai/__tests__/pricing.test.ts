import { describe, it, expect } from "vitest";
import { computeCostUsd, getPricing, usdToEur } from "../pricing";

describe("pricing", () => {
  it("calcule correctement le cout pour Claude Haiku", () => {
    const pricing = getPricing("anthropic", "claude-haiku-4-5-20251001");
    expect(pricing).toBeTruthy();
    // 1000 tokens in + 500 tokens out
    // input  = 1000/1M * 1.0 = 0.001
    // output = 500/1M * 5.0 = 0.0025
    // total  = 0.0035 USD
    const cost = computeCostUsd(pricing!, 1000, 500);
    expect(cost).toBeCloseTo(0.0035, 6);
  });

  it("ajoute le request fee Perplexity Sonar", () => {
    const pricing = getPricing("perplexity", "sonar");
    expect(pricing).toBeTruthy();
    // 500 in + 500 out + 1 request
    // tokens = (500+500)/1M * 1.0 = 0.001
    // request = 0.005
    // total = 0.006
    const cost = computeCostUsd(pricing!, 500, 500);
    expect(cost).toBeCloseTo(0.006, 6);
  });

  it("retourne null pour un modele inconnu", () => {
    expect(getPricing("openai", "gpt-9000-fictif")).toBeNull();
  });

  it("convertit USD en EUR", () => {
    expect(usdToEur(1)).toBeCloseTo(0.92, 4);
    expect(usdToEur(0.5)).toBeCloseTo(0.46, 4);
  });
});
