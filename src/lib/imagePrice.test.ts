import { describe, expect, it } from "vitest";
import { parseImagePrice } from "./imagePrice";

describe("image OCR price parsing", () => {
  it("parses explicit currencies and common thousands/decimal formats", () => {
    expect(parseImagePrice("US$1,299.99")).toEqual({ amount: 1299.99, currency: "USD", currencyAmbiguous: false });
    expect(parseImagePrice("Prix 1.299,00 €")).toEqual({ amount: 1299, currency: "EUR", currencyAmbiguous: false });
    expect(parseImagePrice("1,299 MAD")).toEqual({ amount: 1299, currency: "MAD", currencyAmbiguous: false });
    expect(parseImagePrice("CA$89.95")).toEqual({ amount: 89.95, currency: "CAD", currencyAmbiguous: false });
    expect(parseImagePrice("$89.95 USD")).toEqual({ amount: 89.95, currency: "USD", currencyAmbiguous: false });
  });

  it("does not guess currencies from ambiguous symbols", () => {
    expect(parseImagePrice("$89.95")).toEqual({ amount: null, currency: null, currencyAmbiguous: true });
    expect(parseImagePrice("¥1,299")).toEqual({ amount: null, currency: null, currencyAmbiguous: true });
  });

  it("does not invent a price when OCR found no supported currency and amount", () => {
    expect(parseImagePrice("Regular 1,299; today 999")).toEqual({ amount: null, currency: null, currencyAmbiguous: false });
    expect(parseImagePrice("USD 0")).toEqual({ amount: null, currency: null, currencyAmbiguous: false });
  });
});
