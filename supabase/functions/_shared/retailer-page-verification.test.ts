import { describe, expect, it } from "vitest";
import { parseProductMetadata } from "./product-metadata.ts";
import { inspectAndVerifyRetailerProductPage, retailerPageMatchesProduct, verifyRetailerProductPage } from "./retailer-page-verification.ts";
import type { PinnedFetchTransport, PinnedSocket } from "./pinned-fetch.ts";

const seed = {
  itemId: "item-1", productId: "product-1", variantId: null,
  title: "Sony WH-1000XM5 Wireless Headphones", brand: "Sony",
  modelNumber: "WH-1000XM5", gtin: "4548736132610", variantLabel: "Black",
  condition: "new",
  currency: "EUR",
};

const productPage = (overrides: Record<string, unknown> = {}) => `<script type="application/ld+json">${JSON.stringify({
  "@type": "Product", name: "Sony WH-1000XM5 Wireless Headphones Black", brand: { "@type": "Brand", name: "Sony" },
  model: "WH-1000XM5", gtin13: "4548736132610", color: "Black", image: "/black.jpg",
  offers: { "@type": "Offer", price: "299.00", priceCurrency: "EUR", availability: "https://schema.org/InStock", itemCondition: "https://schema.org/NewCondition" },
  ...overrides,
})}</script>`;

function transportFor(html: string, robotsText = "User-agent: *\nAllow: /"): PinnedFetchTransport {
  return {
    async connect() {
      let request = "";
      let offset = 0;
      let bytes: Uint8Array | null = null;
      const socket: PinnedSocket = {
        async write(value) { request += new TextDecoder().decode(value); return value.length; },
        async read(buffer) {
          if (!bytes) {
            const robots = request.split(" ")[1]?.endsWith("/robots.txt");
            const body = new TextEncoder().encode(robots ? robotsText : html);
            const contentType = robots ? "text/plain" : "text/html";
            const responseHeader = new TextEncoder().encode(`HTTP/1.1 200 OK\r\nContent-Type: ${contentType}\r\nContent-Length: ${body.length}\r\n\r\n`);
            bytes = new Uint8Array(responseHeader.length + body.length);
            bytes.set(responseHeader);
            bytes.set(body, responseHeader.length);
          }
          if (offset >= bytes.length) return null;
          const count = Math.min(buffer.length, bytes.length - offset);
          buffer.set(bytes.subarray(offset, offset + count));
          offset += count;
          return count;
        },
        close() {},
      };
      return socket;
    },
    async startTls(value) { return value; },
  };
}

describe("retailer page offer verification", () => {
  it("requires matching identity, requested variant, valid price, and currency", () => {
    const matches = parseProductMetadata(productPage(), "https://shop.example/headphones");
    expect(retailerPageMatchesProduct(seed, matches)).toBe(true);
    expect(retailerPageMatchesProduct(seed, parseProductMetadata(productPage({ gtin13: "4006381333931" }), "https://shop.example/item"))).toBe(false);
    expect(retailerPageMatchesProduct({ ...seed, variantLabel: "Silver" }, matches)).toBe(false);
    expect(retailerPageMatchesProduct(seed, parseProductMetadata(productPage({ offers: { price: "Contact us", priceCurrency: "EUR" } }), "https://shop.example/item"))).toBe(false);
  });

  it("does not confirm a different condition as the exact saved item", () => {
    const refurbished = productPage({
      offers: { price: "199.00", priceCurrency: "EUR", itemCondition: "https://schema.org/RefurbishedCondition" },
    });
    expect(retailerPageMatchesProduct(seed, parseProductMetadata(refurbished, "https://shop.example/headphones"))).toBe(false);
  });

  it("returns a retailer-page price only after a bounded DNS-pinned fetch matches the product", async () => {
    const offer = await verifyRetailerProductPage(
      "http://93.184.216.35/product",
      seed,
      async () => [],
      transportFor(productPage()),
      "2026-10-12T12:00:00.000Z",
    );
    expect(offer).toMatchObject({
      item_id: "item-1", source: "retailer_page", is_verified: true, price: 299,
      currency: "EUR", availability: "in_stock", condition: "new", product_match_confidence: 1,
      match_type: "retailer_page_verified_gtin",
    });
  });

  it("does not inspect product pages disallowed by robots.txt", async () => {
    const offer = await verifyRetailerProductPage(
      "http://93.184.216.36/product",
      seed,
      async () => [],
      transportFor(productPage(), "User-agent: *\nDisallow: /product"),
    );
    expect(offer).toBeNull();
  });

  it("returns a safe failure reason when a fetched page cannot confirm this product", async () => {
    const attempt = await inspectAndVerifyRetailerProductPage(
      "http://93.184.216.37/product",
      seed,
      async () => [],
      transportFor(productPage({ gtin13: "4006381333931" })),
    );
    expect(attempt).toMatchObject({ offer: null, status: 200, errorCode: "product_identity_not_confirmed", evidence: { hasPrice: true, currency: "EUR" } });
  });

  it("classifies robots denial without exposing page content", async () => {
    const attempt = await inspectAndVerifyRetailerProductPage(
      "http://93.184.216.38/product",
      seed,
      async () => [],
      transportFor(productPage(), "User-agent: *\nDisallow: /product"),
    );
    expect(attempt).toMatchObject({ offer: null, status: null, errorCode: "robots_restricted", evidence: { hasPrice: false, hasImage: false } });
  });

  it("does not assign perfect identity confidence when a retailer page has no GTIN", async () => {
    const pageWithoutGtin = productPage({ gtin13: undefined });
    const offer = await verifyRetailerProductPage(
      "http://93.184.216.34/product",
      { ...seed, gtin: null },
      async () => [],
      transportFor(pageWithoutGtin),
      "2026-10-12T12:00:00.000Z",
    );
    expect(offer).toMatchObject({
      is_verified: true,
      product_match_confidence: 0.98,
      match_type: "retailer_page_verified_model",
    });
  });

  it("keeps a retailer-confirmed price below exact confidence when condition is unstated", async () => {
    const html = productPage({
      offers: { price: "299.00", priceCurrency: "EUR", availability: "https://schema.org/InStock" },
    });
    const offer = await verifyRetailerProductPage(
      "http://93.184.216.34/product",
      seed,
      async () => [],
      transportFor(html),
      "2026-10-12T12:00:00.000Z",
    );
    expect(offer).toMatchObject({ is_verified: true, product_match_confidence: 0.84 });
    expect(offer?.match_type).toContain("condition_unconfirmed");
  });

  it("keeps title-only retailer matches below exact-offer confidence when coverage is partial", async () => {
    const pageWithoutGtin = productPage({ gtin13: undefined });
    const offer = await verifyRetailerProductPage(
      "http://93.184.216.34/product",
      {
        ...seed,
        title: "Sony WH-1000XM5 Wireless Headphones Black Extra",
        brand: null,
        modelNumber: null,
        gtin: null,
        variantLabel: null,
      },
      async () => [],
      transportFor(pageWithoutGtin),
      "2026-10-12T12:00:00.000Z",
    );
    expect(offer?.is_verified).toBe(true);
    expect(offer?.match_type).toBe("retailer_page_verified_title");
    expect(offer?.product_match_confidence).toBeLessThan(0.9);
  });

  it("does not verify conflicting page prices", async () => {
    const html = `${productPage()}<meta property="product:price:amount" content="199.00"><meta property="product:price:currency" content="EUR">`;
    expect(await verifyRetailerProductPage("http://93.184.216.34/product", seed, async () => [], transportFor(html))).toBeNull();
  });
});
