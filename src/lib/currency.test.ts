import { describe, expect, it } from "vitest";
import { isSupportedCurrency, formatPrice } from "./currency";

describe("currency display safety", () => {
  it("recognizes configured currencies without accepting provider-only codes", () => {
    expect(isSupportedCurrency("MAD")).toBe(true);
    expect(isSupportedCurrency("usd")).toBe(false);
    expect(isSupportedCurrency("INR")).toBe(false);
  });

  it("prints an unsupported ISO code instead of silently labeling the amount USD", () => {
    expect(formatPrice(1299.5, "INR")).toBe("1,299.50 INR");
    expect(formatPrice(1299.5, "usd")).toContain("$");
  });
});
