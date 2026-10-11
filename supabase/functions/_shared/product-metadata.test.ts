import { describe, expect, it } from "vitest";
import { parseProductMetadata } from "./product-metadata";

describe("product page metadata extraction", () => {
  it("extracts a nested JSON-LD product and normalizes relative images and variants", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"ProductGroup","name":"Headphones","hasVariant":[{"@type":"Product","name":"Headphones Black","color":"Black"}]},{"@type":"https://schema.org/Product","name":"Sony WH-1000XM5","brand":{"@type":"Brand","name":"Sony"},"model":"WH-1000XM5","gtin13":"4548736132610","image":["/img/main.jpg",{"url":"https://cdn.example/side.jpg"}],"description":"Noise cancelling","category":"Audio","offers":{"@type":"Offer","price":"299.00","priceCurrency":"EUR","availability":"https://schema.org/InStock","itemCondition":"https://schema.org/NewCondition"}}]}</script>`;
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

  it("does not invent availability, condition, currency, price, or title", () => {
    const result = parseProductMetadata(`<meta property="og:description" content="A page without product data">`, "https://store.example/item");
    expect(result.title).toBeNull();
    expect(result.price).toBeNull();
    expect(result.currency).toBe("");
    expect(result.availability).toBe("unknown");
    expect(result.condition).toBe("unknown");
  });
});
