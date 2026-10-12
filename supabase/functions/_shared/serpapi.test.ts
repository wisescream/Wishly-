import { describe, expect, it } from "vitest";
import { parseSerpApiShoppingResponse } from "./serpapi.ts";

describe("SerpApi Shopping response parsing", () => {
  it("returns shopping result rows", () => {
    const rows = [{ title: "Headphones", extracted_price: 90 }];
    expect(parseSerpApiShoppingResponse({ shopping_results: rows })).toEqual({ rows, error: null });
  });

  it("preserves an actual empty search as a successful result", () => {
    expect(parseSerpApiShoppingResponse({ shopping_results: [] })).toEqual({ rows: [], error: null });
    expect(parseSerpApiShoppingResponse({ search_metadata: { status: "Success" } })).toEqual({ rows: [], error: null });
  });

  it("classifies HTTP 200 provider error payloads as failures without exposing their text", () => {
    expect(parseSerpApiShoppingResponse({ error: "Invalid API key: secret-value" })).toEqual({ rows: [], error: "provider_error" });
  });

  it("rejects invalid top-level response shapes", () => {
    expect(parseSerpApiShoppingResponse(null)).toEqual({ rows: [], error: "invalid_response" });
    expect(parseSerpApiShoppingResponse([])).toEqual({ rows: [], error: "invalid_response" });
  });
});
