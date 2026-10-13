import type { ProviderAdapter } from "./types";
import type { ProductCandidate } from "@/types/database";
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

};
