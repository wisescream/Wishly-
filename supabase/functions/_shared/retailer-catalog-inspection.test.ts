import { describe, expect, it } from "vitest";
import { chooseSitemapProductPages, inspectRetailerCatalog, isProductSitemapUrl, parseSitemapLocations, retailerCatalogEvidenceIsSufficient } from "./retailer-catalog-inspection.ts";
import type { PinnedFetchTransport, PinnedSocket } from "./pinned-fetch.ts";

function retailerTransport(host = "shop.example", robots = `User-agent: *\nAllow: /\nSitemap: https://${host}/sitemap.xml`): PinnedFetchTransport {
  const product = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org", "@type": "Product", name: "Blue wool jacket",
    image: `https://${host}/jacket.jpg`, brand: { "@type": "Brand", name: "Example" },
    offers: { "@type": "Offer", price: "89.00", priceCurrency: "EUR" },
  })}</script>`;
  return {
    async connect() {
      let request = "";
      let body: Uint8Array | null = null;
      let offset = 0;
      const socket: PinnedSocket = {
        async write(bytes) { request += new TextDecoder().decode(bytes); return bytes.length; },
        async read(buffer) {
          if (!body) {
            const path = request.split(" ")[1] || "/";
            const content = path === "/robots.txt" ? robots
              : path === "/sitemap.xml" ? `<urlset><url><loc>https://${host}/products/blue-wool-jacket</loc></url></urlset>`
                : product;
            const type = path === "/robots.txt" ? "text/plain" : path === "/sitemap.xml" ? "application/xml" : "text/html";
            const payload = new TextEncoder().encode(content);
            const headers = new TextEncoder().encode(`HTTP/1.1 200 OK\r\nContent-Type: ${type}\r\nContent-Length: ${payload.length}\r\n\r\n`);
            body = new Uint8Array(headers.length + payload.length);
            body.set(headers); body.set(payload, headers.length);
          }
          if (offset >= body.length) return null;
          const amount = Math.min(buffer.length, body.length - offset);
          buffer.set(body.subarray(offset, offset + amount)); offset += amount;
          return amount;
        },
        close() {},
      };
      return socket;
    },
    async startTls(socket) { return socket; },
  };
}

describe("bounded retailer catalog inspection", () => {
  it("keeps only unique public sitemap URLs on the retailer's domain", () => {
    expect(parseSitemapLocations(`
      <url><loc>https://shop.example/products/jacket?color=blue&amp;size=m</loc></url>
      <url><loc>https://shop.example/products/jacket?color=blue&amp;size=m</loc></url>
      <url><loc>https://other.example/products/shoes</loc></url>
      <url><loc>javascript:alert(1)</loc></url>
    `, "https://shop.example/sitemap.xml")).toEqual([
      "https://shop.example/products/jacket?color=blue&size=m",
    ]);
  });

  it("selects product-like URLs within the inspection bound", () => {
    expect(chooseSitemapProductPages([
      "https://shop.example/blog/new-season",
      "https://shop.example/products/coat",
      "https://shop.example/product/shoe-1",
      "https://shop.example/category/shoes",
      "https://shop.example/p/handbag-7",
    ], 2)).toEqual([
      "https://shop.example/products/coat",
      "https://shop.example/product/shoe-1",
    ]);
    expect(chooseSitemapProductPages(["not a URL"])).toEqual([]);
    expect(chooseSitemapProductPages([
      "https://shop.example/blue-jacket-81",
      "https://shop.example/linen-trousers-90",
    ], 2, true)).toEqual([
      "https://shop.example/blue-jacket-81",
      "https://shop.example/linen-trousers-90",
    ]);
  });

  it("recognizes product-specific sitemap files for stores using slug URLs", () => {
    expect(isProductSitemapUrl("https://shop.example/sitemap_products_1.xml")).toBe(true);
    expect(isProductSitemapUrl("https://shop.example/sitemaps/catalog.xml")).toBe(true);
    expect(isProductSitemapUrl("https://shop.example/sitemap.xml")).toBe(false);
    expect(isProductSitemapUrl("javascript:alert(1)")).toBe(false);
  });

  it("validates a retailer only when a product page exposes title, price, currency, and image", () => {
    expect(retailerCatalogEvidenceIsSufficient({ title: "Leather jacket", hasPrice: true, currency: "EUR", hasImage: true })).toBe(true);
    expect(retailerCatalogEvidenceIsSufficient({ title: "Leather jacket", hasPrice: false, currency: "EUR", hasImage: true })).toBe(false);
    expect(retailerCatalogEvidenceIsSufficient({ title: "Leather jacket", hasPrice: true, hasImage: true })).toBe(false);
    expect(retailerCatalogEvidenceIsSufficient({ title: "", hasPrice: true, currency: "EUR", hasImage: true })).toBe(false);
  });

  it("validates a public retailer only after reading an allowed sitemap product page", async () => {
    const result = await inspectRetailerCatalog(
      "shop.example",
      async (_host, type) => type === "A" ? ["93.184.216.34"] : [],
      retailerTransport(),
    );
    expect(result).toMatchObject({
      status: "validated", errorCode: null, httpStatus: 200,
      pageUrl: "https://shop.example/products/blue-wool-jacket",
      evidence: { title: "Blue wool jacket", hasPrice: true, currency: "EUR", hasImage: true },
    });
  });

  it("keeps a retailer restricted when robots.txt disallows its product pages", async () => {
    const result = await inspectRetailerCatalog(
      "blocked.example",
      async (_host, type) => type === "A" ? ["93.184.216.34"] : [],
      retailerTransport("blocked.example", "User-agent: *\nDisallow: /products\nAllow: /sitemap.xml\nSitemap: https://blocked.example/sitemap.xml"),
    );
    expect(result).toMatchObject({ status: "restricted", errorCode: "robots_restricted" });
  });
});
