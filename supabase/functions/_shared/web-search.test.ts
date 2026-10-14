import { describe, expect, it } from "vitest";
import { extractRetailerCitations, isRetailerUrl, parseWebSnippetPrice } from "./web-search";

describe("bounded web-search citation parsing", () => {
  it("keeps unique direct retailer citations and rejects search or unsafe URLs", () => {
    const citations = extractRetailerCitations([
      { type: "url_citation", url_citation: { url: "https://shop.example/p/1", title: "Product", content: "Model X" } },
      { type: "url_citation", url_citation: { url: "https://shop.example/p/1", title: "Duplicate" } },
      { type: "url_citation", url_citation: { url: "https://google.com/search?q=x", title: "Search" } },
      { type: "url_citation", url_citation: { url: "javascript:alert(1)", title: "Unsafe" } },
    ]);
    expect(citations).toHaveLength(1);
    expect(citations[0]).toMatchObject({ url: "https://shop.example/p/1", title: "Product", content: "Model X" });
    expect(isRetailerUrl("https://user:pass@shop.example/p")).toBe(false);
    expect(isRetailerUrl("https://magazine.avito.ma/tag/maroc/page/3/")).toBe(false);
    expect(isRetailerUrl("https://store.frmf.ma/collections/official-jerseys")).toBe(true);
  });

  it("parses supported currency formats without inventing a currency", () => {
    expect(parseWebSnippetPrice("Price € 1.299,00", "USD")).toEqual({ amount: 1299, currency: "EUR" });
    expect(parseWebSnippetPrice("$89.99", "CAD")).toEqual({ amount: 89.99, currency: "CAD" });
    expect(parseWebSnippetPrice("US$89.99", "CAD")).toEqual({ amount: 89.99, currency: "USD" });
    expect(parseWebSnippetPrice("$89.99", "MAD")).toBeNull();
    expect(parseWebSnippetPrice("₹4,999", "INR")).toEqual({ amount: 4999, currency: "INR" });
    expect(parseWebSnippetPrice("¥1,299", "CNY")).toEqual({ amount: 1299, currency: "CNY" });
    expect(parseWebSnippetPrice("89.99", "USD")).toBeNull();
    expect(parseWebSnippetPrice("0 USD", "USD")).toBeNull();
  });
});
