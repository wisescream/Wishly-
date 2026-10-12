import type { ProviderAdapter } from "./types";
import type { ProductCandidate, FetchedOffer } from "@/types/database";
import { getRelevantMoroccanRetailers } from "@/lib/retailers";

export const MoroccanRetailersProvider: ProviderAdapter = {
  id: "moroccan_retailers",
  name: "Moroccan Online Retailers (Jumia, Marjane, Electroplanet...)",
  isAvailable: () => true,

  async searchByQuery(query: string): Promise<ProductCandidate[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    const retailers = getRelevantMoroccanRetailers(cleanQuery);

    return retailers.map((r) => ({
      title: cleanQuery,
      brand: null,
      model_number: null,
      gtin: null,
      image_url: null,
      description: `Search results on ${r.name}`,
      price: null,
      currency: "MAD",
      store: r.name,
      url: r.buildSearchUrl(cleanQuery),
      confidence: 0.82,
      match_reason: `Live search on ${r.name} (${r.domain})`,
      source: "moroccan_retailer_live",
    }));
  },

  async lookupByBarcode(barcode: string): Promise<ProductCandidate | null> {
    const clean = barcode.replace(/[^\d]/g, "");
    if (!clean) return null;

    // Search Moroccan catalog for the GTIN
    const searchUrl = `https://www.jumia.ma/catalog/?q=${clean}`;
    return {
      title: `Product #${clean}`,
      brand: null,
      model_number: null,
      gtin: clean,
      image_url: null,
      description: "Search in Moroccan stores by GTIN",
      price: null,
      currency: "MAD",
      store: "Jumia Maroc",
      url: searchUrl,
      confidence: 0.85,
      match_reason: `Moroccan GTIN lookup for ${clean}`,
      source: "moroccan_retailer_barcode",
    };
  },

  async findOffersForProduct(product): Promise<FetchedOffer[]> {
    const query = [product.brand, product.model_number || product.title]
      .filter(Boolean)
      .join(" ")
      .trim();

    if (!query) return [];

    const retailers = getRelevantMoroccanRetailers(query || product.title);

    return retailers.map((r): FetchedOffer => ({
      store: r.name,
      price: 0, // Direct search link, price will be updated upon visiting or price checker
      currency: "MAD",
      url: r.buildSearchUrl(query || product.title),
      condition: "new",
      availability: "in_stock",
      delivery_estimate: "Livraison au Maroc",
      source: "moroccan_retailer",
      last_verified_at: new Date().toISOString(),
    }));
  },
};
