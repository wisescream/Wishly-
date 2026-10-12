import { describe, expect, it } from "vitest";
import { resolveSearchMarket } from "./search-market.ts";

describe("profile-based search market", () => {
  it("uses the user's country defaults and preferred language", () => {
    expect(resolveSearchMarket("MA", "MAD", "ar")).toEqual({ country: "MA", gl: "ma", hl: "ar", currency: "MAD" });
    expect(resolveSearchMarket("DE", "EUR", "de")).toEqual({ country: "DE", gl: "de", hl: "de", currency: "EUR" });
  });

  it("preserves a valid preferred currency and language for an unlisted country", () => {
    expect(resolveSearchMarket("BR", "EUR", "pt-BR")).toEqual({ country: "BR", gl: "br", hl: "pt-BR", currency: "EUR" });
  });

  it("falls back safely for malformed profile preferences", () => {
    expect(resolveSearchMarket("unknown", "not-currency", "not_language")).toEqual({ country: "US", gl: "us", hl: "en", currency: "USD" });
  });
});
