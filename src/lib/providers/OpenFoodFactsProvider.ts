import type { ProviderAdapter } from "./types";
import type { ProductCandidate, FetchedOffer } from "@/types/database";

export const OpenFoodFactsProvider: ProviderAdapter = {
  id: "openfoodfacts",
  name: "Open Food & Beauty Facts Global Catalog",
  isAvailable: () => true,

  async searchByQuery(query: string): Promise<ProductCandidate[]> {
    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
          query
        )}&search_simple=1&action=process&json=1&page_size=5`
      );
      if (!res.ok) return [];
      const data = await res.json();
      const products = data.products || [];

      return products.map((p: any): ProductCandidate => ({
        title: p.product_name || p.generic_name || "Unknown Product",
        brand: p.brands || null,
        gtin: p.code || null,
        image_url: p.image_url || p.image_front_url || null,
        description: p.categories || null,
        price: null,
        currency: "USD",
        store: "Supermarket / Retail",
        confidence: 0.8,
        source: "openfoodfacts",
      }));
    } catch {
      return [];
    }
  },

  async lookupByBarcode(barcode: string): Promise<ProductCandidate | null> {
    try {
      const cleanBarcode = barcode.replace(/[^\d]/g, "");
      if (!cleanBarcode) return null;

      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${cleanBarcode}.json`);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.status !== 1 || !data.product) return null;

      const p = data.product;
      return {
        title: p.product_name || p.generic_name || `Product ${cleanBarcode}`,
        brand: p.brands || null,
        gtin: cleanBarcode,
        image_url: p.image_url || p.image_front_url || null,
        description: p.categories || null,
        price: null,
        currency: "USD",
        store: "Retail Store",
        confidence: 1.0,
        match_reason: `Verified GTIN ${cleanBarcode}`,
        source: "openfoodfacts",
      };
    } catch {
      return null;
    }
  },

  async findOffersForProduct(): Promise<FetchedOffer[]> {
    return [];
  },
};
