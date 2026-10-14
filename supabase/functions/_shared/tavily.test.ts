import { describe, expect, it, vi } from "vitest";
import { buildRetailerQueries, classifyTavilyFailure, parseTavilyResponse, searchTavily } from "./tavily.ts";
import { searchSearXNG } from "./searxng.ts";

describe("Tavily discovery input normalization", () => {
  it("classifies provider limits and billing responses without retrying them", () => {
    expect(classifyTavilyFailure(429)).toBe("rate_limited");
    expect(classifyTavilyFailure(402)).toBe("insufficient_credits");
    expect(classifyTavilyFailure(503)).toBe("provider_unavailable");
  });
  it("creates bounded market-aware clothing queries", () => {
    const queries = buildRetailerQueries({ title: "Pegasus 41", brand: "Nike", category: "sneakers", country: "MA", language: "fr" });
    expect(queries).toHaveLength(3);
    expect(queries[0]).toContain("Nike Pegasus 41");
    expect(queries[0]).toContain("Morocco");
    expect(queries[1]).toContain("chaussures");
  });

  it("returns no queries for missing product identity", () => {
    expect(buildRetailerQueries({ title: " " })).toEqual([]);
  });

  it("builds localized Portuguese and Turkish queries for their markets", () => {
    const portugal = buildRetailerQueries({ title: "Veja Campo", category: "sneakers", country: "PT", language: "pt-PT" });
    const turkey = buildRetailerQueries({ title: "New Balance 530", country: "TR", language: "tr" });
    expect(portugal[0]).toContain("Portugal");
    expect(portugal[1]).toContain("roupa sapatos loja preço");
    expect(turkey[1]).toContain("giyim ayakkabı mağaza fiyat");
    expect(turkey[0]).toContain("Turkey Türkiye");
  });

  it("keeps item identifiers in focused searches and includes nearby international markets", () => {
    const queries = buildRetailerQueries({
      title: "Air Max 90",
      brand: "Nike",
      model: "CN8490-002",
      sku: "CN8490-002",
      gtin: "0194958641234",
      category: "sneakers",
      country: "MA",
      language: "fr-MA",
    });
    expect(queries).toHaveLength(3);
    expect(queries[0]).toContain("CN8490-002");
    expect(queries[0]).toContain("0194958641234");
    expect(queries[1]).toContain("vêtements chaussures");
    expect(queries[2]).toContain("France");
    expect(queries[2]).toContain("Spain España");
  });

  it("uses nearby markets for European searches while keeping the user's market first", () => {
    const queries = buildRetailerQueries({ title: "Veja Campo", country: "DE", language: "de-DE" });
    expect(queries[0]).toContain("Germany Deutschland");
    expect(queries[1]).toContain("Kleidung Schuhe");
    expect(queries[2]).toContain("Netherlands Nederland");
    expect(queries[2]).toContain("France");
  });

  it("drops malformed result URLs and validates search result fields", () => {
    const parsed = parseTavilyResponse({ results: [
      { title: "Shoe listing", url: "https://shop.example/shoe", content: "Nike model", score: 0.91 },
      { title: "Bad URL", url: "javascript:alert(1)", content: "price" },
      { url: "https://shop.example/missing-title", content: "" },
    ] });
    expect(parsed.results).toEqual([{ title: "Shoe listing", url: "https://shop.example/shoe", content: "Nike model", score: 0.91 }]);
  });

  it("sends API credentials server-side and restricts a retailer query to selected domains", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }));
    await searchTavily("server-only-key", '"Nike Air Max" sneakers', fetcher as typeof fetch, ["www.shop.example", "bad domain"]);
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.tavily.com/search");
    expect((request.headers as Record<string, string>).Authorization).toBe("Bearer server-only-key");
    expect(JSON.parse(String(request.body))).toMatchObject({ include_domains: ["shop.example"] });
  });

  it("returns provider failures without treating them as empty successful searches", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 429 }));
    const result = await searchTavily("key", "shoes", fetcher as typeof fetch);
    expect(result.response.status).toBe(429);
    expect(result.data.results).toEqual([]);
    expect(result.data.error).toContain("429");
  });

  it("keeps a successful provider usable after another source fails", async () => {
    const searx = await searchSearXNG("https://fallback-test.example", "product", "en", async () => new Response("limited", { status: 429 }), { sleep: async () => {}, random: () => 0 });
    const tavilyFetcher = vi.fn(async () => new Response(JSON.stringify({ results: [{ title: "Listing", url: "https://retailer.example/item", content: "" }] }), { status: 200 }));
    expect(searx.response.ok).toBe(false);
    const tavily = await searchTavily("key", "product", tavilyFetcher as typeof fetch);
    expect(tavily.response.ok).toBe(true);
    expect(tavily.data.results).toHaveLength(1);
  });

  it("aborts timed out requests", async () => {
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    await expect(searchTavily("key", "product", fetcher as typeof fetch, [], 1)).rejects.toMatchObject({ name: "AbortError" });
  });
});
