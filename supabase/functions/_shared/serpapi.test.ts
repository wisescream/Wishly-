import { describe, expect, it } from "vitest";
import { buildSerpApiShoppingRequest, classifySerpApiFailure, describeSerpApiHttpFailure, parseSerpApiShoppingResponse } from "./serpapi.ts";

describe("SerpApi Shopping response parsing", () => {
  it("builds the documented request and rejects malformed requests before quota reservation", () => {
    const valid = buildSerpApiShoppingRequest({ query: "  Nike   Air Max ", gl: "FR", hl: "fr-MA", apiKey: "server-key" });
    expect(valid.error).toBeNull();
    expect(valid.url.searchParams.get("q")).toBe("Nike Air Max");
    expect(valid.url.searchParams.get("gl")).toBe("fr");
    expect(valid.url.searchParams.get("hl")).toBe("fr-ma");
    expect(valid.url.searchParams.has("currency")).toBe(false);
    expect(buildSerpApiShoppingRequest({ query: "  ", gl: "fr", hl: "fr", apiKey: "key" }).error).toBe("missing_query");
    expect(buildSerpApiShoppingRequest({ query: "shoes", gl: "France", hl: "fr", apiKey: "key" }).error).toBe("invalid_request");
  });
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


describe("SerpApi HTTP failure messages", () => {
  it("distinguishes invalid requests, credentials, billing, and rate limits", () => {
    expect(describeSerpApiHttpFailure(400)).toContain("request parameters");
    expect(describeSerpApiHttpFailure(401)).toContain("SERPAPI_KEY");
    expect(describeSerpApiHttpFailure(402)).toContain("credits");
    expect(describeSerpApiHttpFailure(429)).toContain("request limit");
  });

  it("does not include arbitrary provider response text", () => {
    expect(describeSerpApiHttpFailure(500)).toBe("SerpAPI is temporarily unavailable. Wishly will retry later.");
  });

  it("extracts a missing-query diagnosis from a 400 response without retaining the body", () => {
    const body = JSON.stringify({ error: "Missing query `q` parameter." });
    expect(classifySerpApiFailure(400, body)).toBe("missing_query");
    expect(describeSerpApiHttpFailure(400, body)).toContain("without a product query");
  });

  it("identifies invalid credentials but never returns the provider's key text", () => {
    const body = JSON.stringify({ error: "Invalid API key: do-not-leak-this-value" });
    expect(classifySerpApiFailure(400, body)).toBe("invalid_api_key");
    expect(describeSerpApiHttpFailure(400, body)).toContain("rejected its API key");
    expect(describeSerpApiHttpFailure(400, body)).not.toContain("do-not-leak-this-value");
  });

  it("classifies engine, quota, and access failures without exposing raw messages", () => {
    expect(classifySerpApiFailure(400, JSON.stringify({ error: "Invalid engine parameter" }))).toBe("invalid_engine");
    expect(classifySerpApiFailure(400, JSON.stringify({ error: "Your account has run out of searches" }))).toBe("insufficient_credits");
    expect(classifySerpApiFailure(403, "")).toBe("account_access");
  });
});
