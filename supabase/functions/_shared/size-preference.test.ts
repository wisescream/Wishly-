import { describe, expect, it } from "vitest";
import { hasPreferredOfferSize, matchesPreferredOfferSize } from "./size-preference.ts";

describe("size-aware offer comparisons", () => {
  const profile = {
    apparel_sizes: { tops: { preferred: "M", actual: "L", alternatives: ["S"] } },
    shoe_sizes: { preferred: { value: "EU 39", system: "EU" }, actual: { value: "EU 40", system: "EU" } },
  };

  it("respects preferred and actual clothing sizes and excludes unrelated sizes", () => {
    expect(hasPreferredOfferSize(profile, "Tops")).toBe(true);
    expect(matchesPreferredOfferSize(profile, "Tops", "M")).toBe(true);
    expect(matchesPreferredOfferSize(profile, "Tops", "S")).toBe(false);
    expect(matchesPreferredOfferSize(profile, "Tops", "XL")).toBe(false);
  });

  it("requires matching footwear size systems before treating prices as comparable", () => {
    expect(matchesPreferredOfferSize(profile, "Shoes", "EU 39", "EU")).toBe(true);
    expect(matchesPreferredOfferSize(profile, "Shoes", "39", null)).toBe(false);
    expect(matchesPreferredOfferSize(profile, "Shoes", "US 8", "US")).toBe(false);
  });

  it("does not invent a size preference for categories with no profile", () => {
    expect(hasPreferredOfferSize(null, "Shoes")).toBe(false);
    expect(matchesPreferredOfferSize(null, "Shoes", null)).toBe(true);
  });
});
