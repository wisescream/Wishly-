import { describe, expect, it } from "vitest";
import { isProductPriceCurrent, parseProductMetadata } from "./product-metadata";

describe("product page metadata extraction", () => {
  it("rejects expired price-validity metadata but keeps an inclusive valid-through date current", () => {
    expect(isProductPriceCurrent(20, "2020-01-01", Date.parse("2026-10-14T12:00:00Z"))).toBe(false);
    expect(isProductPriceCurrent(20, "2026-10-14", Date.parse("2026-10-14T12:00:00Z"))).toBe(true);
    expect(isProductPriceCurrent(20, "invalid-date", Date.parse("2026-10-14T12:00:00Z"))).toBe(false);
  });
  it("extracts a nested JSON-LD product and normalizes relative images and variants", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"ProductGroup","name":"Headphones","hasVariant":[{"@type":"Product","name":"Headphones Black","sku":"WH-BLK","gtin13":"4548736132610","color":"Black","size":"256 GB","image":"/img/black.jpg","offers":{"@type":"Offer","price":"299.00","priceCurrency":"EUR"}}]},{"@type":"https://schema.org/Product","name":"Sony WH-1000XM5","brand":{"@type":"Brand","name":"Sony"},"model":"WH-1000XM5","gtin13":"4548736132610","image":["/img/main.jpg",{"url":"https://cdn.example/side.jpg"}],"description":"Noise cancelling","category":"Audio","offers":{"@type":"Offer","price":"299.00","priceCurrency":"EUR","availability":"https://schema.org/InStock","itemCondition":"https://schema.org/NewCondition"}}]}</script>`;
    const result = parseProductMetadata(html, "https://shop.example/product");
    expect(result.title).toBe("Sony WH-1000XM5");
    expect(result.brand).toBe("Sony");
    expect(result.gtin).toBe("4548736132610");
    expect(result.image_url).toBe("https://shop.example/img/main.jpg");
    expect(result.additional_images).toEqual(["https://cdn.example/side.jpg"]);
    expect(result.price).toBe(299);
    expect(result.currency).toBe("EUR");
    expect(result.availability).toBe("in_stock");
    expect(result.condition).toBe("new");
    expect(result.variants).toEqual([{
      name: "Headphones Black", sku: "WH-BLK", gtin: "4548736132610", color: "Black", size: "256 GB", price: 299,
      image_url: "https://shop.example/img/black.jpg",
    }]);
  });

  it("withholds variant prices when a variant reports conflicting currencies", () => {
    const html = `<script type="application/ld+json">{"@type":"ProductGroup","name":"Camera","hasVariant":[{"@type":"Product","name":"Camera Silver","color":"Silver","offers":[{"price":"700","priceCurrency":"USD"},{"price":"650","priceCurrency":"EUR"}]}]}</script>`;
    const result = parseProductMetadata(html, "https://shop.example/camera");
    expect(result.variants).toEqual([{ name: "Camera Silver", color: "Silver" }]);
  });

  it("handles metadata attributes in either order and HTML entities", () => {
    const html = `<meta content="A &amp; B headphones" property="og:title"><meta content="https://cdn.example/photo.jpg" property="og:image"><meta content="1.299,00" property="product:price:amount"><meta content="1.499,00" property="product:original_price:amount"><meta content="EUR" property="product:price:currency"><meta name="description" content="Comfort &amp; sound">`;
    const result = parseProductMetadata(html, "https://shop.example/p");
    expect(result.title).toBe("A & B headphones");
    expect(result.image_url).toBe("https://cdn.example/photo.jpg");
    expect(result.price).toBe(1299);
    expect(result.original_price).toBe(1499);
    expect(result.discount_percent).toBe(13);
    expect(result.description).toBe("Comfort & sound");
  });

  it("keeps parsing when a page contains invalid numeric HTML entities", () => {
    const result = parseProductMetadata(`<meta property="og:title" content="Camera &#x110000; model">`, "https://store.example/camera");
    expect(result.title).toBe("Camera � model");
  });

  it("does not invent availability, condition, currency, price, or title", () => {
    const result = parseProductMetadata(`<meta property="og:description" content="A page without product data">`, "https://store.example/item");
    expect(result.title).toBeNull();
    expect(result.price).toBeNull();
    expect(result.price_conflict).toBe(false);
    expect(result.currency).toBe("");
    expect(result.availability).toBe("unknown");
    expect(result.condition).toBe("unknown");
  });

  it("preserves open-box as a separate retailer condition", () => {
    const result = parseProductMetadata(`<script type="application/ld+json">${JSON.stringify({
      "@type": "Product",
      name: "Sony WH-1000XM5",
      offers: { price: "199", priceCurrency: "EUR", itemCondition: "https://schema.org/UsedCondition" },
    })}</script>`, "https://shop.example/product");
    expect(result.condition).toBe("used");
    const openBox = parseProductMetadata(`<script type="application/ld+json">${JSON.stringify({
      "@type": "Product",
      name: "Sony WH-1000XM5",
      offers: { price: "249", priceCurrency: "EUR", itemCondition: "https://schema.org/OpenBoxCondition" },
    })}</script>`, "https://shop.example/product");
    expect(openBox.condition).toBe("open_box");
  });

  it("falls back to a valid page price when the structured offer price is unusable", () => {
    const html = `<script type="application/ld+json">{"@type":"Product","name":"Camera","offers":{"price":"Contact retailer","priceCurrency":"USD"}}</script><meta property="product:price:amount" content="799.00"><meta property="product:price:currency" content="USD">`;
    const result = parseProductMetadata(html, "https://store.example/camera");
    expect(result.price).toBe(799);
    expect(result.currency).toBe("USD");
    expect(result.price_conflict).toBe(false);
  });

  it("withholds price and currency when structured data conflicts with page metadata", () => {
    const html = `<script type="application/ld+json">{"@type":"Product","name":"Camera","offers":{"price":"799.00","priceCurrency":"USD"}}</script><meta property="product:price:amount" content="699.00"><meta property="product:price:currency" content="USD">`;
    const result = parseProductMetadata(html, "https://store.example/camera");
    expect(result.price).toBeNull();
    expect(result.original_price).toBeNull();
    expect(result.currency).toBe("");
    expect(result.price_conflict).toBe(true);
  });

  it("uses AggregateOffer.lowPrice without treating its highPrice range as a conflict", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Product", name: "Travel backpack", image: "https://shop.example/bag.jpg",
      offers: { "@type": "AggregateOffer", lowPrice: "79.00", highPrice: "129.00", priceCurrency: "MAD" },
    })}</script>`;
    expect(parseProductMetadata(html, "https://shop.example/bag")).toMatchObject({ price: 79, currency: "MAD", price_conflict: false });
  });

  it("extracts product identity and offer data from schema.org Microdata", () => {
    const html = `<div itemscope itemtype="https://schema.org/Product">
      <h1 itemprop="name">Sac en cuir</h1>
      <img itemprop="image" src="/images/bag.jpg">
      <span itemprop="brand">Atelier Maroc</span>
      <span itemprop="sku">AM-42</span>
      <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
        <meta itemprop="priceCurrency" content="MAD"><meta itemprop="price" content="749">
        <link itemprop="availability" href="https://schema.org/InStock">
      </div>
    </div>`;
    expect(parseProductMetadata(html, "https://boutique.ma/products/bag")).toMatchObject({
      title: "Sac en cuir", image_url: "https://boutique.ma/images/bag.jpg", brand: "Atelier Maroc",
      sku: "AM-42", price: 749, currency: "MAD", availability: "in_stock",
    });
  });

  it("treats different current offer prices as ambiguous instead of selecting one", () => {
    const html = `<script type="application/ld+json">{"@type":"Product","name":"Camera","offers":[{"price":"799.00","priceCurrency":"USD"},{"price":"699.00","priceCurrency":"USD"}]}</script>`;
    const result = parseProductMetadata(html, "https://store.example/camera");
    expect(result.price).toBeNull();
    expect(result.price_conflict).toBe(true);
  });
});
