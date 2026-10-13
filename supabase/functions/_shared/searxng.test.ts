import { describe, expect, it, vi } from "vitest";
import { buildSearXNGSearchUrl, parseSearXNGResponse, searchSearXNG, toSearXNGCandidates } from "./searxng.ts";

describe("SearXNG web-search fallback", () => {
  it("builds an HTTPS JSON search URL with a bounded query and language", () => {
    const url = buildSearXNGSearchUrl("https://search.example/", "Nike Air Max 90", "fr");
    expect(url?.origin).toBe("https://search.example");
    expect(url?.pathname).toBe("/search");
    expect(url?.searchParams.get("q")).toBe("Nike Air Max 90");
    expect(url?.searchParams.get("language")).toBe("fr");
    expect(url?.searchParams.get("format")).toBe("json");
    expect(buildSearXNGSearchUrl("http://search.example", "shoes")).toBeNull();
    expect(buildSearXNGSearchUrl("https://user:pass@search.example", "shoes")).toBeNull();
  });

  it("filters non-retail pages, invalid URLs, duplicates, and malformed results", () => {
    expect(parseSearXNGResponse({ results: [
      { title: "Sneakers listing", url: "https://shop.example/sneakers", content: "Model 123", score: 1.4, thumbnail: "https://img.example/shoe.jpg" },
      { title: "Duplicate", url: "https://shop.example/sneakers" },
      { title: "Search page", url: "https://www.google.com/search?q=shoes" },
      { title: "Unsafe", url: "javascript:alert(1)" },
      null,
    ] })).toEqual([{
      title: "Sneakers listing", url: "https://shop.example/sneakers", content: "Model 123", score: 1,
      imageUrl: "https://img.example/shoe.jpg",
    }]);
  });

  it("turns search results into leads without inventing offer prices or match confidence", () => {
    const leads = parseSearXNGResponse({ results: [{ title: "Running shoes", url: "https://www.shop.example/shoes", content: "Sale $90" }] });
    expect(toSearXNGCandidates(leads)).toEqual([{
      title: "Running shoes", brand: null, image_url: null, price: null, currency: undefined,
      store: "shop.example", url: "https://www.shop.example/shoes", confidence: 0.25,
      match_reason: "Unverified public web-search lead. Wishly has not inspected this product page or confirmed its price.",
      source: "searxng_web_search",
    }]);
  });

  it("uses the configured instance and handles upstream failures without parsing them as results", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ results: [{ title: "Coat", url: "https://shop.example/coat" }] }), { status: 200 }));
    const success = await searchSearXNG("https://search.example", "coat", "en", fetcher as typeof fetch);
    expect(success.results).toHaveLength(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("https://search.example/search?");
    const failed = await searchSearXNG("https://search.example", "coat", "en", async () => new Response("down", { status: 503 }));
    expect(failed.response.status).toBe(503);
    expect(failed.results).toEqual([]);
  });
});
