import type { ProviderAdapter } from "./types";
import type { ProductCandidate, FetchedOffer } from "@/types/database";

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

      const offers: FetchedOffer[] = (item.offers || []).map((o: any) => ({
        store: o.merchant || "Online Retailer",
        price: Number(o.price || 0),
        currency: "USD",
        url: o.link || "#",
        condition: o.condition ? String(o.condition).toLowerCase() : "unknown",
        availability: o.availability && /out of stock|unavailable/i.test(String(o.availability))
          ? "out_of_stock"
          : o.availability && /in stock|available/i.test(String(o.availability))
          ? "in_stock"
          : "unknown",
        shipping_cost: o.shipping ? parseFloat(o.shipping) : 0,
        total_price: o.price ? Number(o.price) + (o.shipping ? parseFloat(o.shipping) : 0) : null,
        source: "upcitemdb",
        last_verified_at: o.updated_t ? new Date(o.updated_t * 1000).toISOString() : new Date().toISOString(),
      }));

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

      return item.offers.map((o: any): FetchedOffer => ({
        store: o.merchant || "Online Retailer",
        price: Number(o.price || 0),
        currency: "USD",
        url: o.link || "#",
        condition: o.condition ? String(o.condition).toLowerCase() : "unknown",
        availability: o.availability && /out of stock|unavailable/i.test(String(o.availability))
          ? "out_of_stock"
          : o.availability && /in stock|available/i.test(String(o.availability))
          ? "in_stock"
          : "unknown",
        shipping_cost: o.shipping ? parseFloat(o.shipping) : 0,
        total_price: o.price ? Number(o.price) + (o.shipping ? parseFloat(o.shipping) : 0) : null,
        source: "upcitemdb",
        last_verified_at: o.updated_t ? new Date(o.updated_t * 1000).toISOString() : new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  },
};
