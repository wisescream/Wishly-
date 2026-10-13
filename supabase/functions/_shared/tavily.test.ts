import { describe, expect, it, vi } from "vitest";
import { buildRetailerQueries, parseTavilyResponse, searchTavily } from "./tavily.ts";

describe("Tavily discovery input normalization", () => {
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
});
