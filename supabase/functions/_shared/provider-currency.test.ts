import { describe, expect, it } from "vitest";
import { resolveProviderCurrency } from "./provider-currency.ts";

describe("provider currency evidence", () => {
  it("uses explicit ISO codes and currency symbols", () => {
    expect(resolveProviderCurrency("USD 99.00", "MAD")).toBe("USD");
    expect(resolveProviderCurrency("€99.00", "MAD")).toBe("EUR");
    expect(resolveProviderCurrency("C$99.00", "USD")).toBe("CAD");
    expect(resolveProviderCurrency("A$99.00", "USD")).toBe("AUD");
    expect(resolveProviderCurrency("CN¥99", "JPY")).toBe("CNY");
  });

  it("uses a fallback only when an unqualified symbol is compatible", () => {
    expect(resolveProviderCurrency("$99.00", "USD")).toBe("USD");
    expect(resolveProviderCurrency("$99.00", "CAD")).toBe("CAD");
    expect(resolveProviderCurrency("¥99", "CNY")).toBe("CNY");
    expect(resolveProviderCurrency("$99.00", "MAD")).toBeNull();
    expect(resolveProviderCurrency("¥99", "EUR")).toBeNull();
  });

  it("uses the market currency only when the provider text has no currency marker", () => {
    expect(resolveProviderCurrency("99.00", "EUR")).toBe("EUR");
    expect(resolveProviderCurrency("99.00", "not-a-currency")).toBeNull();
  });
});
