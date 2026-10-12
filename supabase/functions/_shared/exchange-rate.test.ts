import { afterEach, describe, expect, it, vi } from "vitest";
import { addOfferCurrencyConversions, parseExchangeRate } from "./exchange-rate";

afterEach(() => vi.unstubAllGlobals());

describe("exchange rates", () => {
  it("accepts only matching currency pairs and dated positive rates", () => {
    expect(parseExchangeRate({ base: "USD", quote: "MAD", rate: 9.8, date: "2026-10-10" }, "usd", "mad"))
      .toMatchObject({ base: "USD", quote: "MAD", rate: 9.8, date: "2026-10-10", source: "frankfurter" });
    expect(parseExchangeRate({ base: "EUR", quote: "MAD", rate: 9.8, date: "2026-10-10" }, "USD", "MAD")).toBeNull();
    expect(parseExchangeRate({ base: "USD", quote: "MAD", rate: 0, date: "2026-10-10" }, "USD", "MAD")).toBeNull();
    expect(parseExchangeRate({ base: "USD", quote: "MAD", rate: 9.8, date: "not-a-date" }, "USD", "MAD")).toBeNull();
  });

  it("converts item and known total prices while retaining the source amount and rate date", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ base: "EUR", quote: "MAD", rate: 10.25, date: "2026-10-10" }), { status: 200 })));
    const [converted] = await addOfferCurrencyConversions([
      { price: 10, total_price: 12, total_is_estimated: false, currency: "EUR" },
    ], "MAD");
    expect(converted).toMatchObject({ price: 10, currency: "EUR", converted_price: 102.5, converted_total_price: 123, currency_converted_to: "MAD", exchange_rate: 10.25, exchange_rate_at: "2026-10-10T00:00:00.000Z", exchange_rate_source: "frankfurter" });
  });

  it("does not invent a conversion or convert an estimated total", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));
    const [converted] = await addOfferCurrencyConversions([
      { price: 10, total_price: 12, total_is_estimated: true, currency: "GBP" },
    ], "MAD");
    expect(converted.converted_price).toBeNull();
    expect(converted.converted_total_price).toBeNull();
    expect(converted.currency_converted_to).toBeNull();
  });
});
