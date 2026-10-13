import { describe, expect, it } from "vitest";
import { classifySeller, getRetailerDomain, inferRetailerCountry, productOfferEvidenceError, robotsTxtAllowsPath, safeCanonicalProductUrl, selectRetailerInspectionTargets } from "./retailer-discovery.ts";

describe("retailer discovery utilities", () => {
  it("normalizes public retailer domains and rejects unsafe URL shapes", () => {
    expect(getRetailerDomain("https://www.shop.example/products/shoe?ref=campaign")).toBe("shop.example");
    expect(getRetailerDomain("http://127.0.0.1/admin")).toBeNull();
    expect(getRetailerDomain("javascript:alert(1)")).toBeNull();
    expect(getRetailerDomain("https://user:pass@shop.example/item")).toBeNull();
  });

  it("classifies only known marketplace and resale domains, and derives country hints", () => {
    expect(classifySeller("vinted.fr")).toBe("marketplace");
    expect(classifySeller("amazon.com")).toBe("marketplace");
    expect(classifySeller("www.jumia.ma")).toBe("marketplace");
    expect(classifySeller("theoutnet.com")).toBe("outlet");
    expect(classifySeller("small-boutique.ma")).toBe("unknown");
    expect(inferRetailerCountry("shop.example.co.uk")).toBe("GB");
    expect(inferRetailerCountry("shop.ma")).toBe("MA");
  });

  it("honors the longest matching robots rule and agent specific groups", () => {
    const robots = "User-agent: *\nDisallow: /\nUser-agent: WishlyBot\nAllow: /products/\nDisallow: /private";
    expect(robotsTxtAllowsPath(robots, "/products/shoes")).toBe(true);
    expect(robotsTxtAllowsPath(robots, "/private/product")).toBe(false);
  });

  it("matches robots wildcards and query strings, with allow winning equal-length ties", () => {
    const robots = "User-agent: *\nDisallow: /*q=\nDisallow: /*--*\nDisallow: /ar/*/*/*/\nAllow: /ar/*/*/\nDisallow: /products/featured\nAllow: /products/featured";
    expect(robotsTxtAllowsPath(robots, "/search?q=sneakers")).toBe(false);
    expect(robotsTxtAllowsPath(robots, "/nike/shoe--black")).toBe(false);
    expect(robotsTxtAllowsPath(robots, "/ar/store/category/product/")).toBe(false);
    expect(robotsTxtAllowsPath(robots, "/ar/store/product/")).toBe(true);
    expect(robotsTxtAllowsPath(robots, "/products/featured")).toBe(true);
  });

  it("supports end-anchored robots rules", () => {
    expect(robotsTxtAllowsPath("User-agent: *\nDisallow: /private$", "/private")).toBe(false);
    expect(robotsTxtAllowsPath("User-agent: *\nDisallow: /private$", "/private/item")).toBe(true);
  });

  it("accepts only same-retailer canonical product URLs", () => {
    expect(safeCanonicalProductUrl("https://www.shop.example/item?variant=1", "https://shop.example/product")).toBe("https://www.shop.example/item?variant=1");
    expect(safeCanonicalProductUrl("https://attacker.example/collect", "https://shop.example/product")).toBe("https://shop.example/product");
    expect(safeCanonicalProductUrl("http://shop.example/product", "https://shop.example/product")).toBe("https://shop.example/product");
  });

  it("selects bounded, high-confidence Shopping retailers once per domain", () => {
    const best = { source: "google_shopping", url: "https://www.shop.example/nike-shoe", product_match_confidence: 0.98 };
    const other = { source: "google_shopping", url: "https://boutique.ma/item", product_match_confidence: 0.93 };
    expect(selectRetailerInspectionTargets([
      best,
      { ...best, url: "https://shop.example/duplicate", product_match_confidence: 0.96 },
      other,
      { ...other, source: "tavily_crawled_page" },
      { ...other, url: "https://possible.example/item", product_match_confidence: 0.84 },
    ], 2)).toEqual([best, other]);
    expect(selectRetailerInspectionTargets([best], 0)).toEqual([]);
  });
});

describe("retailer product validation evidence", () => {
  it("requires product identity, a positive price, and currency", () => {
    expect(productOfferEvidenceError(false, 99, "EUR")).toBe("product_identity_not_confirmed");
    expect(productOfferEvidenceError(true, null, "EUR")).toBe("product_price_or_currency_missing");
    expect(productOfferEvidenceError(true, 99, null)).toBe("product_price_or_currency_missing");
    expect(productOfferEvidenceError(true, 99, "EUR")).toBeNull();
  });

  it("rejects invalid and non-positive observed prices", () => {
    expect(productOfferEvidenceError(true, 0, "MAD")).toBe("product_price_or_currency_missing");
    expect(productOfferEvidenceError(true, Number.NaN, "MAD")).toBe("product_price_or_currency_missing");
    expect(productOfferEvidenceError(true, -10, "MAD")).toBe("product_price_or_currency_missing");
  });
});
