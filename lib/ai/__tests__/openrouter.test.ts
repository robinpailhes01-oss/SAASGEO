import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { callOpenRouter, OpenRouterError } from "../providers/openrouter";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  process.env.OPENROUTER_API_KEY = "or-test-key";
  process.env.OPENROUTER_HTTP_REFERER = "https://ankora.test";
  process.env.OPENROUTER_X_TITLE = "AnkoraTest";
});

afterEach(() => {
  delete process.env.OPENROUTER_API_KEY;
});

function mockResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

describe("openrouter adapter", () => {
  it("appelle correctement OpenRouter avec les bons headers", async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        id: "gen-1",
        model: "anthropic/claude-haiku-4-5",
        choices: [{ message: { role: "assistant", content: "Bonjour" } }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
          cost: 0.00012,
        },
      })
    );

    const result = await callOpenRouter("anthropic/claude-haiku-4-5", {
      prompt: "Salut",
    });

    expect(result.text).toBe("Bonjour");
    expect(result.tokens_in).toBe(10);
    expect(result.tokens_out).toBe(5);
    expect(result.cost_usd).toBeCloseTo(0.00012, 8);
    expect(result.cost_eur).toBeCloseTo(0.00012 * 0.92, 8);
    expect(result.model).toBe("anthropic/claude-haiku-4-5");

    // Verifie les headers
    const call = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    const headers = call[1].headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer or-test-key");
    expect(headers["HTTP-Referer"]).toBe("https://ankora.test");
    expect(headers["X-Title"]).toBe("AnkoraTest");
  });

  it("transmet system prompt + user prompt en messages", async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        id: "gen-1",
        model: "openai/gpt-4o",
        choices: [{ message: { role: "assistant", content: "OK" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 },
      })
    );

    await callOpenRouter("openai/gpt-4o", {
      system: "Tu es un expert.",
      prompt: "Question ?",
    });

    const body = JSON.parse(
      (mockFetch.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string
    );
    expect(body.messages).toEqual([
      { role: "system", content: "Tu es un expert." },
      { role: "user", content: "Question ?" },
    ]);
    expect(body.model).toBe("openai/gpt-4o");
  });

  it("active jsonMode via response_format quand demande", async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        id: "gen-1",
        model: "openai/gpt-4o",
        choices: [{ message: { content: "{}" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 },
      })
    );

    await callOpenRouter("openai/gpt-4o", {
      prompt: "p",
      jsonMode: true,
    });

    const body = JSON.parse(
      (mockFetch.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string
    );
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("extrait les sources des citations Perplexity", async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        id: "gen-1",
        model: "perplexity/sonar",
        choices: [{ message: { content: "Selon les sources..." } }],
        usage: { prompt_tokens: 10, completion_tokens: 30, cost: 0.001 },
        citations: [
          "https://wikipedia.org/wiki/Hotel",
          "https://tripadvisor.fr/page",
        ],
      })
    );

    const result = await callOpenRouter("perplexity/sonar", {
      prompt: "Quels sont les meilleurs hotels de Paris ?",
    });

    expect(result.sources).toHaveLength(2);
    expect(result.sources?.[0].url).toBe("https://wikipedia.org/wiki/Hotel");
  });

  it("extrait les sources via annotations url_citation", async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        id: "gen-1",
        model: "openai/gpt-4o",
        choices: [
          {
            message: {
              content: "Reponse",
              annotations: [
                {
                  type: "url_citation",
                  url_citation: { url: "https://example.com", title: "Example" },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 5, cost: 0 },
      })
    );

    const result = await callOpenRouter("openai/gpt-4o", { prompt: "p" });
    expect(result.sources).toHaveLength(1);
    expect(result.sources?.[0]).toEqual({
      url: "https://example.com",
      title: "Example",
    });
  });

  it("throw OpenRouterError si OPENROUTER_API_KEY manquant", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(
      callOpenRouter("openai/gpt-4o", { prompt: "p" })
    ).rejects.toThrow(OpenRouterError);
  });

  it("throw OpenRouterError sur erreur HTTP", async () => {
    mockFetch.mockResolvedValue(
      mockResponse({ error: { message: "Insufficient credits" } }, false, 402)
    );
    await expect(
      callOpenRouter("openai/gpt-4o", { prompt: "p" })
    ).rejects.toMatchObject({
      name: "OpenRouterError",
      status: 402,
    });
  });

  it("retourne cost_usd=0 si la reponse n'inclut pas usage.cost", async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        id: "gen-1",
        model: "openai/gpt-4o",
        choices: [{ message: { content: "Reponse sans cost" } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      })
    );

    const result = await callOpenRouter("openai/gpt-4o", { prompt: "p" });
    expect(result.cost_usd).toBe(0);
    expect(result.tokens_in).toBe(100);
    expect(result.tokens_out).toBe(50);
  });
});
