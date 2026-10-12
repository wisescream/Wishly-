import { describe, expect, it } from "vitest";
import { parseProviderShipping } from "./offerCosts";

describe("provider shipping normalization", () => {
  it("keeps absent, conditional, and mismatched-currency shipping unknown", () => {
    expect(parseProviderShipping(null, "USD").known).toBe(false);
    expect(parseProviderShipping("Free shipping on orders over $50", "USD").known).toBe(false);
    expect(parseProviderShipping("EUR 5", "USD").known).toBe(false);
  });

  it("recognizes explicit free shipping and valid numeric amounts", () => {
    expect(parseProviderShipping("Free Shipping", "USD")).toMatchObject({ cost: 0, known: true });
    expect(parseProviderShipping("$4.99 delivery", "USD")).toMatchObject({ cost: 4.99, known: true });
    expect(parseProviderShipping(0, "USD")).toMatchObject({ cost: 0, known: true });
  });

  it("does not assign an ambiguous dollar symbol to an unrelated currency", () => {
    expect(parseProviderShipping("$4.99 delivery", "MAD").known).toBe(false);
    expect(parseProviderShipping("US$4.99 delivery", "USD")).toMatchObject({ cost: 4.99, known: true });
    expect(parseProviderShipping("US$4.99 delivery", "CAD").known).toBe(false);
    expect(parseProviderShipping("C$4.99 delivery", "CAD")).toMatchObject({ cost: 4.99, known: true });
  });
});
