import { describe, it, expect } from "vitest";
import {
  extractProductInfoFromUrl,
  isValidGtin,
} from "@/lib/importService";
import {
  inferProductCategory,
  getRelevantMoroccanRetailers,
  MOROCCAN_RETAILERS,
} from "@/lib/retailers";
import { MoroccanRetailersProvider } from "@/lib/providers/MoroccanRetailersProvider";

describe("Product Import & URL Parsing", () => {
  it("correctly identifies Moroccan stores and infers MAD currency", () => {
    const jumia = extractProductInfoFromUrl(
      "https://www.jumia.ma/apple-iphone-15-pro-max-256gb-natural-titanium-12345.html"
    );
    expect(jumia.store).toBe("Jumia Maroc");
    expect(jumia.currency).toBe("MAD");
    expect(jumia.brand).toBe("Apple");

    const marjane = extractProductInfoFromUrl(
      "https://www.marjanemall.ma/smartphones-samsung-galaxy-s24-ultra.html"
    );
    expect(marjane.store).toBe("Marjane Mall");
    expect(marjane.currency).toBe("MAD");
    expect(marjane.brand).toBe("Samsung");

    const electroplanet = extractProductInfoFromUrl(
      "https://www.electroplanet.ma/sony-wh-1000xm5-wireless-noise-cancelling.html"
    );
    expect(electroplanet.store).toBe("Electroplanet");
    expect(electroplanet.currency).toBe("MAD");
    expect(electroplanet.brand).toBe("Sony");

    const cosmos = extractProductInfoFromUrl(
      "https://cosmos.ma/recherche?controller=search&s=ps5"
    );
    expect(cosmos.store).toBe("Cosmos Electro");
    expect(cosmos.currency).toBe("MAD");
  });

  it("correctly identifies international stores and currencies", () => {
    const usAmazon = extractProductInfoFromUrl(
      "https://www.amazon.com/Apple-iPhone-15-Pro-256GB/dp/B0CHX1W1XY"
    );
    expect(usAmazon.currency).toBe("USD");
    expect(usAmazon.brand).toBe("Apple");

    const frStore = extractProductInfoFromUrl(
      "https://www.boulanger.fr/ref/123456-dyson-v15-detect"
    );
    expect(frStore.currency).toBe("EUR");
    expect(frStore.brand).toBe("Dyson");

    const ukStore = extractProductInfoFromUrl(
      "https://www.currys.co.uk/products/logitech-mx-master-3s-10238475.html"
    );
    expect(ukStore.currency).toBe("GBP");
    expect(ukStore.brand).toBe("Logitech");
  });

  it("validates GTIN/EAN barcodes accurately", () => {
    expect(isValidGtin("0194253784562")).toBe(true);
    expect(isValidGtin("12345670")).toBe(true);
    expect(isValidGtin("not-a-barcode")).toBe(false);
    expect(isValidGtin("123")).toBe(false);
  });
});

describe("Moroccan Retailers Registry & Category Inference", () => {
  it("infers appropriate product categories", () => {
    expect(inferProductCategory("Apple iPhone 15 Pro Max 256GB")).toBe("electronics");
    expect(inferProductCategory("Samsung Galaxy S24 Ultra")).toBe("electronics");
    expect(inferProductCategory("Sony PlayStation 5 Slim")).toBe("electronics");
    expect(inferProductCategory("Robe midi en lin Zara")).toBe("fashion");
    expect(inferProductCategory("Sneakers Nike Air Max 90")).toBe("fashion");
    expect(inferProductCategory("Canapé d'angle convertible IKEA")).toBe("home");
    expect(inferProductCategory("Parfum Yves Saint Laurent Libre")).toBe("beauty");
    expect(inferProductCategory("Ballon de football Decathlon Kipsta")).toBe("sports");
  });

  it("selects category-relevant Moroccan retailers", () => {
    const techRetailers = getRelevantMoroccanRetailers("Apple MacBook Pro M3");
    const techDomains = techRetailers.map((r) => r.domain);
    expect(techDomains).toContain("electroplanet.ma");
    expect(techDomains).toContain("cosmos.ma");
    expect(techDomains).toContain("jumia.ma");

    const beautyRetailers = getRelevantMoroccanRetailers("Sérum visage hydratant");
    const beautyDomains = beautyRetailers.map((r) => r.domain);
    expect(beautyDomains).toContain("beautysuccess.co");

    const sportsRetailers = getRelevantMoroccanRetailers("Tapis de course pliable");
    const sportsDomains = sportsRetailers.map((r) => r.domain);
    expect(sportsDomains).toContain("decathlon.ma");

    const homeRetailers = getRelevantMoroccanRetailers("Table à manger bois massif");
    const homeDomains = homeRetailers.map((r) => r.domain);
    expect(homeDomains).toContain("ikea.ma");
    expect(homeDomains).toContain("bricoma.ma");
  });

  it("builds valid search query URLs with proper URI encoding", () => {
    const jumia = MOROCCAN_RETAILERS.find((r) => r.id === "jumia_ma");
    expect(jumia).toBeDefined();
    const jumiaUrl = jumia!.buildSearchUrl("iPhone 15 & AirPods");
    expect(jumiaUrl).toContain("https://www.jumia.ma/catalog/?q=");
    expect(jumiaUrl).toContain("iPhone%2015%20%26%20AirPods");

    const marjane = MOROCCAN_RETAILERS.find((r) => r.id === "marjanemall");
    expect(marjane).toBeDefined();
    const marjaneUrl = marjane!.buildSearchUrl("Samsung S24");
    expect(marjaneUrl).toContain("https://www.marjanemall.ma/catalogsearch/result/?q=Samsung%20S24");
  });
});

describe("MoroccanRetailersProvider", () => {
  it("searches Moroccan stores with a live query", async () => {
    const candidates = await MoroccanRetailersProvider.searchByQuery("AirPods Pro 2");
    expect(candidates.length).toBeGreaterThan(0);

    const first = candidates[0];
    expect(first.currency).toBe("MAD");
    expect(first.price).toBeNull();
    expect(first.url).toBeTruthy();
    expect(first.match_reason).toContain("Live search on");
  });

  it("handles GTIN barcode lookup in Moroccan stores", async () => {
    const result = await MoroccanRetailersProvider.lookupByBarcode("195949038234");
    expect(result).not.toBeNull();
    expect(result?.gtin).toBe("195949038234");
    expect(result?.currency).toBe("MAD");
    expect(result?.store).toBe("Jumia Maroc");
  });
});
