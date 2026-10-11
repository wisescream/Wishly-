import type { ProviderAdapter } from "./types";
import type { ProductCandidate, FetchedOffer } from "@/types/database";
import { supabase } from "@/lib/supabase";

export const InternalCatalogProvider: ProviderAdapter = {
  id: "internal_catalog",
  name: "Wishly Verified Catalog",
  isAvailable: () => true,

  async searchByQuery(query: string): Promise<ProductCandidate[]> {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id, title, brand, model_number, gtin, primary_image_url, description")
        .ilike("title", `%${query}%`)
        .limit(5);

      if (error || !data) return [];

      return data.map((p): ProductCandidate => ({
        id: p.id,
        title: p.title,
        brand: p.brand,
        model_number: p.model_number,
        gtin: p.gtin,
        image_url: p.primary_image_url,
        description: p.description,
        price: null,
        currency: "USD",
        store: "Wishly Catalog",
        confidence: 0.95,
        match_reason: "Verified in internal catalog",
        source: "internal_catalog",
      }));
    } catch {
      return [];
    }
  },

  async lookupByBarcode(barcode: string): Promise<ProductCandidate | null> {
    try {
      const cleanBarcode = barcode.replace(/[^\d]/g, "");
      const { data, error } = await supabase
        .from("products")
        .select("id, title, brand, model_number, gtin, primary_image_url, description")
        .eq("gtin", cleanBarcode)
        .single();

      if (error || !data) return null;

      return {
        id: data.id,
        title: data.title,
        brand: data.brand,
        model_number: data.model_number,
        gtin: data.gtin,
        image_url: data.primary_image_url,
        description: data.description,
        price: null,
        currency: "USD",
        store: "Wishly Catalog",
        confidence: 1.0,
        match_reason: `Exact GTIN match (${cleanBarcode})`,
        source: "internal_catalog",
      };
    } catch {
      return null;
    }
  },

  async findOffersForProduct(product): Promise<FetchedOffer[]> {
    if (!product.gtin && !(product.brand && product.model_number)) return [];
    try {
      // Only shared catalog-linked offers are reusable across wishlists. Never
      // mine arbitrary users' original retailer links as global offers.
      let identity = supabase.from("products").select("id");
      if (product.gtin) identity = identity.eq("gtin", product.gtin.replace(/[^\d]/g, ""));
      else identity = identity.ilike("brand", product.brand!).ilike("model_number", product.model_number!);
      const { data: canonical } = await identity.limit(1).maybeSingle();
      if (!canonical) return [];
      const { data: offers } = await supabase
        .from("store_offers")
        .select("item_id,product_id,variant_id,store,price,currency,shipping_cost,taxes,total_price,shipping_known,taxes_known,total_is_estimated,destination_country,seller,condition,availability,delivery_estimate,source,url,affiliate_url,last_verified_at,updated_at")
        .eq("product_id", canonical.id)
        .order("price", { ascending: true })
        .limit(6);

      if (!offers) return [];

      return offers.map((o) => ({
        store: o.store,
        price: o.price,
        currency: o.currency || "USD",
        shipping_cost: o.shipping_cost || 0,
        taxes: o.taxes || 0,
        total_price: o.total_price,
        condition: o.condition || "new",
        availability: o.availability || "unknown",
        delivery_estimate: o.delivery_estimate || undefined,
        url: o.url,
        affiliate_url: o.affiliate_url || undefined,
        source: "internal_catalog",
        last_verified_at: o.last_verified_at || o.updated_at,
      }));
    } catch {
      return [];
    }
  },
};
