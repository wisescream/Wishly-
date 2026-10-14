import { describe, expect, it } from "vitest";
import { parseProductMetadata } from "./product-metadata.ts";
import { findProductVariantColor, inspectAndVerifyRetailerProductPage, retailerPageMatchesProduct, verifyRetailerProductPage } from "./retailer-page-verification.ts";
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

function transportFor(html: string, robotsText = "User-agent: *\nAllow: /", pageContentType = "text/html"): PinnedFetchTransport {
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
            const contentType = robots ? "text/plain" : pageContentType;
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
  it("does not treat a color word in the brand as the product color", () => {
    expect(findProductVariantColor("Black & Decker 20V Drill", "Black & Decker")).toBeNull();
    expect(findProductVariantColor("Black & Decker Black 20V Drill", "Black & Decker")).toBe("black");
  });

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

  it("does not let a matching GTIN override an explicitly different color, capacity, or size", () => {
    const colorPage = parseProductMetadata(productPage({ color: "Silver" }), "https://shop.example/headphones");
    const capacityPage = parseProductMetadata(productPage({ storageCapacity: "512 GB" }), "https://shop.example/headphones");
    const sizePage = parseProductMetadata(productPage({ size: "EU 39" }), "https://shop.example/headphones");
    expect(retailerPageMatchesProduct({ ...seed, title: `${seed.title} Black` }, colorPage)).toBe(false);
    expect(retailerPageMatchesProduct({ ...seed, title: `${seed.title} 256GB` }, capacityPage)).toBe(false);
    expect(retailerPageMatchesProduct({ ...seed, variantLabel: "EU 40" }, sizePage)).toBe(false);
  });

  it("does not verify a gendered product from a same-GTIN listing with a different or unstated gender", () => {
    const target = { ...seed, title: "Nike Women's Pegasus Black", brand: "Nike", modelNumber: null };
    const malePage = parseProductMetadata(productPage({ name: "Nike Men's Pegasus Black", brand: { name: "Nike" } }), "https://shop.example/shoe");
    const unspecifiedPage = parseProductMetadata(productPage({ name: "Nike Pegasus Black", brand: { name: "Nike" } }), "https://shop.example/shoe");
    const matchingPage = parseProductMetadata(productPage({ name: "Nike Women's Pegasus Black", brand: { name: "Nike" }, size: "US women's 8" }), "https://shop.example/shoe");
    expect(retailerPageMatchesProduct(target, malePage)).toBe(false);
    expect(retailerPageMatchesProduct(target, unspecifiedPage)).toBe(false);
    expect(retailerPageMatchesProduct({ ...target, variantLabel: "US 8" }, matchingPage)).toBe(true);
  });

  it("does not mistake a color word in the brand name for the saved product color", () => {
    const target = { ...seed, title: "Black & Decker Red Drill", brand: "Black & Decker", modelNumber: null, variantLabel: "Red" };
    const page = parseProductMetadata(productPage({
      name: "Black & Decker Drill",
      brand: { name: "Black & Decker" },
      color: "Blue",
    }), "https://shop.example/drill");
    expect(retailerPageMatchesProduct(target, page)).toBe(false);
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

  it("reports non-HTML pages as unsupported instead of as retailer outages", async () => {
    const attempt = await inspectAndVerifyRetailerProductPage(
      "http://93.184.216.39/download", seed, async () => [], transportFor("pdf bytes", "User-agent: *\nAllow: /", "application/pdf"),
    );
    expect(attempt).toMatchObject({ offer: null, status: 200, errorCode: "unsupported_format" });
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

  it("rejects a retailer-confirmed price when condition evidence keeps identity below exact confidence", async () => {
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
    expect(offer).toBeNull();
  });

  it("rejects title-only retailer matches below exact-offer confidence when coverage is partial", async () => {
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
    expect(offer).toBeNull();
  });

  it("rejects prices whose structured validity date has expired", async () => {
    const offer = await verifyRetailerProductPage(
      "http://93.184.216.34/product", seed,
      async () => [],
      transportFor(productPage({ offers: { price: "299.00", priceCurrency: "EUR", priceValidUntil: "2020-01-01", availability: "https://schema.org/InStock", itemCondition: "https://schema.org/NewCondition" } })),
      "2026-10-12T12:00:00.000Z",
    );
    expect(offer).toBeNull();
  });

  it("does not infer a missing product-page currency from the wishlist currency", async () => {
    const html = productPage({ offers: { price: "299.00", availability: "https://schema.org/InStock", itemCondition: "https://schema.org/NewCondition" } });
    expect(await verifyRetailerProductPage("http://93.184.216.34/product", seed, async () => [], transportFor(html))).toBeNull();
  });

  it("keeps shipping and taxes unknown and returns auditable verified evidence", async () => {
    const offer = await verifyRetailerProductPage("http://93.184.216.34/product", seed, async () => [], transportFor(productPage()), "2026-10-12T12:00:00.000Z");
    expect(offer).toMatchObject({
      is_verified: true, verification_status: "verified", verification_reason_code: "retailer_page_identity_price_currency_confirmed",
      shipping_cost: null, taxes: null, shipping_known: false, taxes_known: false,
      url: "http://93.184.216.34/product", product_gtin: "4548736132610", product_model_number: "WH-1000XM5",
    });
    expect(offer?.verification_evidence).toMatchObject({ hasPrice: true, hasImage: true, currency: "EUR" });
  });

  it("does not verify conflicting page prices", async () => {
    const html = `${productPage()}<meta property="product:price:amount" content="199.00"><meta property="product:price:currency" content="EUR">`;
    expect(await verifyRetailerProductPage("http://93.184.216.34/product", seed, async () => [], transportFor(html))).toBeNull();
  });

  it("does not attribute a product reached through a cross-domain redirect to the source retailer", async () => {
    const transport: PinnedFetchTransport = {
      async connect(address) {
        let request = "";
        let offset = 0;
        let bytes: Uint8Array | null = null;
        const socket: PinnedSocket = {
          async write(value) { request += new TextDecoder().decode(value); return value.length; },
          async read(buffer) {
            if (!bytes) {
              const host = request.match(/\r\nHost: ([^\r\n]+)/i)?.[1] || "";
              const path = request.split(" ")[1] || "/";
              const isRobots = path === "/robots.txt";
              const isSourceProduct = host === "source-redirect.example" && !isRobots;
              const status = isSourceProduct ? 302 : 200;
              const body = new TextEncoder().encode(isRobots ? "User-agent: *\nAllow: /" : isSourceProduct ? "" : productPage());
              const location = isSourceProduct ? "Location: https://destination-redirect.example/product\r\n" : "";
              const response = new TextEncoder().encode(`HTTP/1.1 ${status} ${status === 302 ? "Found" : "OK"}\r\n${location}Content-Type: ${isRobots ? "text/plain" : "text/html"}\r\nContent-Length: ${body.length}\r\n\r\n`);
              bytes = new Uint8Array(response.length + body.length); bytes.set(response); bytes.set(body, response.length);
            }
            if (offset >= bytes.length) return null;
            const amount = Math.min(buffer.length, bytes.length - offset);
            buffer.set(bytes.subarray(offset, offset + amount)); offset += amount; return amount;
          },
          close() {},
        };
        return socket;
      },
      async startTls(socket) { return socket; },
    };
    const attempt = await inspectAndVerifyRetailerProductPage(
      "https://source-redirect.example/product", seed,
      async (host, type) => type === "A" ? [host === "source-redirect.example" ? "93.184.216.34" : "93.184.216.35"] : [],
      transport,
    );
    expect(attempt).toMatchObject({ offer: null, finalUrl: "https://destination-redirect.example/product", errorCode: "cross_domain_product_redirect" });
  });
});
