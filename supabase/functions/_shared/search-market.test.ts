import { describe, expect, it } from "vitest";
import { resolveSearchMarket } from "./search-market.ts";

describe("profile-based search market", () => {
  it("uses the user's country defaults and preferred language", () => {
    expect(resolveSearchMarket("MA", "MAD", "ar")).toEqual({ country: "MA", gl: "fr", hl: "ar", currency: "MAD" });
    expect(resolveSearchMarket("DE", "EUR", "de")).toEqual({ country: "DE", gl: "de", hl: "de", currency: "EUR" });
  });

  it("preserves a valid preferred currency and language for an unlisted country", () => {
    expect(resolveSearchMarket("BR", "EUR", "pt-BR")).toEqual({ country: "BR", gl: "br", hl: "pt-BR", currency: "EUR" });
  });

  it("uses supported shopping regions when the user country is not available", () => {
    expect(resolveSearchMarket("CN", "CNY", "zh-CN")).toEqual({ country: "CN", gl: "hk", hl: "zh-CN", currency: "CNY" });
    expect(resolveSearchMarket("MA", "MAD", "fr")).toEqual({ country: "MA", gl: "fr", hl: "fr", currency: "MAD" });
    expect(resolveSearchMarket("ZZ", "MAD", "fr")).toEqual({ country: "ZZ", gl: "fr", hl: "fr", currency: "MAD" });
    expect(resolveSearchMarket("", "MAD", "")).toEqual({ country: "US", gl: "fr", hl: "fr", currency: "MAD" });
  });

  it("falls back safely for malformed profile preferences", () => {
    expect(resolveSearchMarket("unknown", "not-currency", "not_language")).toEqual({ country: "US", gl: "us", hl: "en", currency: "USD" });
  });
});
