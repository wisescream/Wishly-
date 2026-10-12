import { describe, expect, it } from "vitest";
import { calculateTotalPurchaseCost, convertAmount, parseShippingEstimate } from "./offer-cost";

describe("offer costs", () => {
  it("recognizes only explicit free shipping and currency-matched numeric delivery fees", () => {
    expect(parseShippingEstimate("Free delivery", "MAD")).toMatchObject({ known: true, amount: 0 });
    expect(parseShippingEstimate("MAD 25.50 delivery", "MAD")).toMatchObject({ known: true, amount: 25.5 });
    expect(parseShippingEstimate("US$ 5.00 delivery", "USD")).toMatchObject({ known: true, amount: 5 });
    expect(parseShippingEstimate("US$ 5.00 delivery", "CAD").known).toBe(false);
    expect(parseShippingEstimate("$5.00 delivery", "MAD").known).toBe(false);
    expect(parseShippingEstimate("Free shipping on orders over $50", "USD").known).toBe(false);
    expect(parseShippingEstimate("€5.99 shipping", "USD").known).toBe(false);
    expect(parseShippingEstimate("Delivery in 3-5 days", "USD").known).toBe(false);
  });

  it("calculates a delivered total only when both shipping and taxes are known", () => {
    expect(calculateTotalPurchaseCost({ price: 100, shippingCost: 5.5, taxes: 8, shippingKnown: true, taxesKnown: true })).toBe(113.5);
    expect(calculateTotalPurchaseCost({ price: 100, shippingCost: 0, taxes: 0, shippingKnown: true, taxesKnown: false })).toBeNull();
    expect(calculateTotalPurchaseCost({ price: 100, shippingCost: 0, taxes: 0, shippingKnown: false, taxesKnown: true })).toBeNull();
    expect(calculateTotalPurchaseCost({ price: 100, shippingCost: -1, taxes: 0, shippingKnown: true, taxesKnown: true })).toBeNull();
  });

  it("converts amounts using a validated positive exchange rate", () => {
    expect(convertAmount(99.95, 10.25)).toBe(1024.49);
    expect(convertAmount(-1, 2)).toBeNull();
    expect(convertAmount(10, 0)).toBeNull();
  });
});
