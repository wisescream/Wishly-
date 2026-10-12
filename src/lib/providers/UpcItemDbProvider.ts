import type { ProviderAdapter } from "./types";
import type { ProductCandidate, FetchedOffer } from "@/types/database";
import { parseProviderShipping } from "./offerCosts";

export function mapUpcItemDbOffer(o: any): FetchedOffer | null {
  const price = Number(o.price);
  const url = typeof o.link === "string" && /^https?:\/\//i.test(o.link) ? o.link : null;
  if (!Number.isFinite(price) || price <= 0 || !url) return null;
  const shipping = parseProviderShipping(o.shipping, "USD");

  return {
    store: o.merchant || "Online Retailer",
    price,
    currency: "USD",
    url,
    condition: o.condition ? String(o.condition).toLowerCase() : "unknown",
    availability: o.availability && /out of stock|unavailable/i.test(String(o.availability))
      ? "out_of_stock"
      : o.availability && /in stock|available/i.test(String(o.availability))
      ? "in_stock"
      : "unknown",
    shipping_cost: shipping.cost,
    shipping_known: shipping.known,
    delivery_estimate: shipping.evidence,
    taxes_known: false,
    total_price: null,
    total_is_estimated: true,
    source: "upcitemdb",
    last_verified_at: o.updated_t ? new Date(o.updated_t * 1000).toISOString() : new Date().toISOString(),
  };
}

export const UpcItemDbProvider: ProviderAdapter = {
  id: "upcitemdb",
  name: "UPCitemdb Global Barcode Directory",
  isAvailable: () => true,

  async searchByQuery(query: string): Promise<ProductCandidate[]> {
    try {
      const res = await fetch(`https://api.upcitemdb.com/prod/trial/search?s=${encodeURIComponent(query)}&type=product`);
      if (!res.ok) return [];
      const data = await res.json();
      const items = data.items || [];

      return items.map((item: any): ProductCandidate => ({
        title: item.title,
        brand: item.brand || null,
        model_number: item.model || null,
        gtin: item.ean || item.upc || null,
        image_url: item.images?.[0] || null,
        description: item.description || null,
        price: null,
        currency: "USD",
        store: item.offers?.[0]?.merchant || "Global Marketplace",
        confidence: 0.85,
        source: "upcitemdb",
      }));
    } catch {
      return [];
    }
  },

  async lookupByBarcode(barcode: string): Promise<ProductCandidate | null> {
    try {
      const cleanBarcode = barcode.replace(/[^\d]/g, "");
      if (!cleanBarcode) return null;

      const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${cleanBarcode}`);
      if (!res.ok) return null;
      const data = await res.json();
      const item = data.items?.[0];
      if (!item) return null;

      const offers: FetchedOffer[] = (item.offers || []).map(mapUpcItemDbOffer).filter((offer: FetchedOffer | null): offer is FetchedOffer => offer !== null);

      return {
        title: item.title,
        brand: item.brand || null,
        model_number: item.model || null,
        gtin: cleanBarcode,
        image_url: item.images?.[0] || null,
        description: item.description || null,
        price: null,
        currency: "USD",
        store: offers[0]?.store || "Retailer",
        confidence: 1.0,
        match_reason: `Verified GTIN ${cleanBarcode}`,
        source: "upcitemdb",
      };
    } catch {
      return null;
    }
  },

  async findOffersForProduct(product): Promise<FetchedOffer[]> {
    if (!product.gtin) return [];
    try {
      const cleanBarcode = product.gtin.replace(/[^\d]/g, "");
      const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${cleanBarcode}`);
      if (!res.ok) return [];
      const data = await res.json();
      const item = data.items?.[0];
      if (!item || !item.offers) return [];

      return item.offers.map(mapUpcItemDbOffer).filter((offer: FetchedOffer | null): offer is FetchedOffer => offer !== null);
    } catch {
      return [];
    }
  },
};
