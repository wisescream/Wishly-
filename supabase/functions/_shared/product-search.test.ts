import { describe, expect, it } from "vitest";
import { buildMarketProductSearchQueries, buildProductSearchQueries } from "./product-search.ts";

describe("provider-neutral product search query planning", () => {
  it("prioritizes exact GTIN, brand/model, then a title and requested variant", () => {
    expect(buildProductSearchQueries({
      gtin: " 4548736132610 ",
      brand: "Sony",
      modelNumber: "WH-1000XM5",
      title: "Sony WH-1000XM5 Wireless Headphones",
      variant: "Black",
    })).toEqual([
      '"4548736132610"',
      "Sony WH-1000XM5",
      "Sony WH-1000XM5 Wireless Headphones Black",
    ]);
  });

  it("does not spend a request on a bare brand when model and identifier are missing", () => {
    expect(buildProductSearchQueries({ brand: "Sony", title: "Sony Wireless Headphones", variant: "Black" }))
      .toEqual(["Sony Wireless Headphones Black"]);
  });

  it("deduplicates overlapping identity terms and bounds provider queries", () => {
    expect(buildProductSearchQueries({
      brand: "Sony",
      modelNumber: "WH-1000XM5",
      title: "Sony WH-1000XM5 Headphones Black",
      variant: "Black",
    }, 2)).toEqual(["Sony WH-1000XM5", "Sony WH-1000XM5 Headphones Black"]);
  });

  it("ignores empty identity data and caps query length", () => {
    expect(buildProductSearchQueries({ brand: "  ", modelNumber: 42, title: "  " })).toEqual([]);
    expect(buildProductSearchQueries({ title: "x".repeat(400) })[0]).toHaveLength(240);
  });

  it("prioritizes a Moroccan retail query without dropping exact product identifiers", () => {
    const queries = buildMarketProductSearchQueries({
      gtin: "4548736132610", brand: "Sony", modelNumber: "WH-1000XM5",
      title: "Sony WH-1000XM5 Wireless Headphones", variant: "Black",
    }, "MA");
    expect(queries).toHaveLength(3);
    expect(queries[0]).toContain("4548736132610");
    expect(queries[1]).toContain("Maroc Morocco prix boutique en ligne");
    expect(buildMarketProductSearchQueries({ title: "Sony headphones" }, "GB")).toEqual(["Sony headphones"]);
  });
});
