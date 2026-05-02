import { describe, it, expect } from "vitest";
import { BusinessInfoSchema, buildBrandExtractPrompt } from "../prompts/brand-extract";
import {
  GeneratedQueriesSchema,
  buildQueriesGenPrompt,
} from "../prompts/queries-gen";
import {
  MentionAnalysisSchema,
  buildMentionAnalysisPrompt,
} from "../prompts/analyze-mention";
import { SynthesisSchema, buildSynthesisPrompt } from "../prompts/synthesis";

describe("prompts/brand-extract", () => {
  it("genere un prompt qui contient l'URL et le texte", () => {
    const { system, prompt } = buildBrandExtractPrompt(
      "Bienvenue chez Harmonie Yacht, charter de yacht a Carnon.",
      "https://harmonie-yacht.fr"
    );
    expect(system).toContain("analyste business");
    expect(prompt).toContain("https://harmonie-yacht.fr");
    expect(prompt).toContain("Harmonie Yacht");
    expect(prompt).toContain("brand_name");
  });

  it("tronque le texte au-dela de 3000 chars", () => {
    const longText = "x".repeat(5000);
    const { prompt } = buildBrandExtractPrompt(longText, "https://test.fr");
    // Le prompt template contient quelques 'x' fixes (Extrais, texte, etc.)
    // donc on accepte une petite marge — l'important est qu'on n'ait pas
    // les 5000 'x' du texte original.
    const xCount = prompt.match(/x/g)?.length ?? 0;
    expect(xCount).toBeGreaterThanOrEqual(3000);
    expect(xCount).toBeLessThan(3050);
  });

  it("le schema valide une reponse correcte", () => {
    const valid = {
      brand_name: "Harmonie Yacht",
      brand_aliases: ["harmonieyacht", "Harmonie", "Yacht Harmonie"],
      industry: "Charter de yacht",
      services: ["Nuit insolite", "Sortie en mer"],
      geo_zone: "Carnon, Languedoc",
      city: "Carnon",
      region: "Hérault",
      country: "France",
      business_scope: "local",
      detected_competitors: [],
      language: "fr",
    };
    expect(() => BusinessInfoSchema.parse(valid)).not.toThrow();
  });

  it("le schema rejette une langue invalide", () => {
    const invalid = {
      brand_name: "X",
      brand_aliases: [],
      industry: null,
      services: [],
      geo_zone: null,
      city: null,
      region: null,
      country: null,
      business_scope: "national",
      detected_competitors: [],
      language: "klingon",
    };
    expect(() => BusinessInfoSchema.parse(invalid)).toThrow();
  });
});

describe("prompts/queries-gen", () => {
  const business = {
    brand_name: "Harmonie Yacht",
    brand_aliases: ["Harmonie"],
    industry: "Charter yacht",
    services: ["Nuit insolite", "Sortie en mer"],
    geo_zone: "Carnon",
    city: null,
    region: null,
    country: null,
    business_scope: "national" as const,
    detected_competitors: ["Yacht XYZ"],
    language: "fr" as const,
  };

  it("genere un prompt en francais quand language=fr", () => {
    const { prompt, system } = buildQueriesGenPrompt(business);
    expect(prompt).toContain("Harmonie Yacht");
    expect(prompt).toContain("Carnon");
    expect(prompt).toContain("francais");
    expect(system).toContain("REGLES STRICTES");
  });

  it("le schema attend exactement 10 requetes par categorie", () => {
    const valid = {
      branded: Array(10).fill("question"),
      service: Array(10).fill("question"),
      comparative: Array(10).fill("question"),
    };
    expect(() => GeneratedQueriesSchema.parse(valid)).not.toThrow();

    const tooFew = { ...valid, branded: Array(5).fill("q") };
    expect(() => GeneratedQueriesSchema.parse(tooFew)).toThrow();
  });
});

describe("prompts/analyze-mention", () => {
  it("genere un prompt qui contient marque, query et reponse", () => {
    const { prompt } = buildMentionAnalysisPrompt({
      brand_name: "Harmonie Yacht",
      brand_aliases: ["Harmonie"],
      query: "Quels sont les meilleurs yachts a Carnon ?",
      ai_response:
        "Je recommande le Yacht XYZ qui propose des sorties au coucher du soleil.",
    });
    expect(prompt).toContain("Harmonie Yacht");
    expect(prompt).toContain("Quels sont les meilleurs yachts");
    expect(prompt).toContain("Yacht XYZ");
  });

  it("schema valide reponse avec mention", () => {
    const valid = {
      brand_mentioned: true,
      mention_position: 2,
      mention_context: "Harmonie Yacht propose une experience...",
      brand_citation_present: false,
      sentiment: "positive",
      competitors_cited: ["Yacht XYZ"],
      sources_cited: ["tripadvisor.fr"],
    };
    expect(() => MentionAnalysisSchema.parse(valid)).not.toThrow();
  });

  it("schema valide reponse sans mention (null position/sentiment/context)", () => {
    const valid = {
      brand_mentioned: false,
      mention_position: null,
      mention_context: null,
      brand_citation_present: false,
      sentiment: null,
      competitors_cited: ["X", "Y"],
      sources_cited: [],
    };
    expect(() => MentionAnalysisSchema.parse(valid)).not.toThrow();
  });
});

describe("prompts/synthesis", () => {
  it("genere un prompt complet avec tous les inputs", () => {
    const { prompt } = buildSynthesisPrompt({
      brand_name: "Harmonie Yacht",
      industry: "Charter yacht",
      technical_score: 25,
      visibility_score: 10,
      visibility_per_provider: { openai: 15, anthropic: 5, perplexity: 0, gemini: 20 },
      mention_rate: 8.3,
      citation_rate: 0,
      top_competitors_observed: ["Yacht XYZ", "Yacht ABC"],
      failed_tech_checks: [
        { label: "Sitemap absent", recommendation: "Creer un sitemap.xml" },
      ],
      passed_tech_checks_count: 12,
      total_tech_checks: 51,
    });
    expect(prompt).toContain("25/100");
    expect(prompt).toContain("10/100");
    expect(prompt).toContain("Yacht XYZ");
    expect(prompt).toContain("Sitemap absent");
    expect(prompt).toContain("8.3%");
  });

  it("REGRESSION : injecte les opportunites manquees pour personnalisation", () => {
    const { prompt, system } = buildSynthesisPrompt({
      brand_name: "Hotel Neptune",
      industry: "Hotellerie",
      city: "Carnon",
      region: "Hérault",
      technical_score: 60,
      visibility_score: 50,
      visibility_per_provider: { openai: 50, anthropic: 50, perplexity: 50, gemini: 50 },
      mention_rate: 25,
      citation_rate: 5,
      top_competitors_observed: ["Domaine de Verchant", "Hotel de la Plage"],
      failed_tech_checks: [],
      passed_tech_checks_count: 40,
      total_tech_checks: 51,
      missed_opportunities: [
        {
          query: "hotel romantique Carnon",
          category: "service",
          provider: "openai",
          competitors_cited: ["Hotel de la Plage", "Domaine de Verchant"],
        },
        {
          query: "meilleur hotel 4 etoiles Hérault",
          category: "comparative",
          provider: "anthropic",
          competitors_cited: ["Domaine de Verchant"],
        },
      ],
    });
    // Le block OPPORTUNITES MANQUEES est present
    expect(prompt).toContain("OPPORTUNITES MANQUEES");
    expect(prompt).toContain("hotel romantique Carnon");
    expect(prompt).toContain("Hotel de la Plage");
    // City injectee
    expect(prompt).toContain("Carnon");
    expect(prompt).toContain("Hérault");
    // System prompt rappelle l'interdit generique
    expect(system).toContain("PERSONNALISEES");
    expect(system).toContain("INTERDIT");
  });

  it("ne casse pas si missed_opportunities absent (compat retro)", () => {
    const { prompt } = buildSynthesisPrompt({
      brand_name: "X",
      industry: null,
      technical_score: 50,
      visibility_score: 50,
      visibility_per_provider: { openai: 50, anthropic: 50, perplexity: 50, gemini: 50 },
      mention_rate: 50,
      citation_rate: 50,
      top_competitors_observed: [],
      failed_tech_checks: [],
      passed_tech_checks_count: 51,
      total_tech_checks: 51,
    });
    expect(prompt).not.toContain("OPPORTUNITES MANQUEES");
  });

  it("schema valide une synthese complete", () => {
    const valid = {
      verdict: "Score 25/100, invisible aux IA majeures.",
      top_competitor: "Yacht XYZ",
      recommendations: [
        {
          priority: "quick_win",
          category: "robots.txt",
          title: "Creer robots.txt",
          description: "Ajouter Allow: / pour GPTBot, ClaudeBot, PerplexityBot",
          impact_score: 7,
        },
        {
          priority: "quick_win",
          category: "schema",
          title: "Schema Organization",
          description: "JSON-LD complet avec name, url, logo",
          impact_score: 6,
        },
        {
          priority: "medium",
          category: "content",
          title: "FAQ structurees",
          description: "10 questions complementaires en H2",
          impact_score: 5,
        },
        {
          priority: "long_term",
          category: "authority",
          title: "Press relations",
          description: "Cibler Le Figaro, Les Echos",
          impact_score: 8,
        },
        {
          priority: "long_term",
          category: "infra",
          title: "Migration SSR",
          description: "Sortir de Lovable vers Next.js SSG",
          impact_score: 9,
        },
      ],
    };
    expect(() => SynthesisSchema.parse(valid)).not.toThrow();
  });

  it("schema rejette < 5 recommandations", () => {
    const invalid = {
      verdict: "verdict",
      top_competitor: null,
      recommendations: [
        {
          priority: "quick_win",
          category: "test",
          title: "Test",
          description: "Test",
          impact_score: 5,
        },
      ],
    };
    expect(() => SynthesisSchema.parse(invalid)).toThrow();
  });
});
