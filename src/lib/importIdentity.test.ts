import { describe, expect, it } from "vitest";
import { normalizeImportVariant, normalizeProductImportUrl, productUrlSearchHint } from "./importIdentity";

describe("wishlist import identity normalization", () => {
  it("removes fragments and ad tracking while retaining variant parameters", () => {
    expect(normalizeProductImportUrl("HTTPS://Shop.Example:443/Product?id=42&utm_source=mail&Color=navy#reviews"))
      .toBe("https://shop.example/Product?id=42&Color=navy");
  });

  it("keeps product-defining query parameters distinct", () => {
    expect(normalizeProductImportUrl("https://shop.example/item?color=navy"))
      .not.toBe(normalizeProductImportUrl("https://shop.example/item?color=black"));
  });

  it("rejects non-http and credential-bearing URLs", () => {
    expect(normalizeProductImportUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeProductImportUrl("https://user:pass@shop.example/item")).toBeNull();
  });

  it("normalizes optional selected variants without crossing variant identities", () => {
    expect(normalizeImportVariant("  EU 42  /  Navy ")).toBe("eu 42 / navy");
    expect(normalizeImportVariant(null)).toBe("");
  });

  it("creates a search hint from the final product path without treating it as imported data", () => {
    expect(productUrlSearchHint("https://shop.example/products/nike-air-max-90-123456.html?color=white"))
      .toBe("nike air max 90");
    expect(productUrlSearchHint("https://shop.example/products/caf%C3%A9_mug"))
      .toBe("café mug");
    expect(productUrlSearchHint("javascript:alert(1)")).toBe("");
    expect(productUrlSearchHint("https://user:pass@shop.example/item")).toBe("");
  });
});
