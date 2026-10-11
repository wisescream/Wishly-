import type { ProviderAdapter } from "./types";
import type { ProductCandidate, FetchedOffer } from "@/types/database";

export const GoogleShoppingProvider: ProviderAdapter = {
  id: "google_shopping",
  name: "Google Shopping & Global Marketplaces",
  // Shopping results require a server-side SerpAPI key. Never ship provider
  // credentials in Vite's public client bundle.
  isAvailable: () => true,

  async searchByQuery(query: string): Promise<ProductCandidate[]> {
    const { data, error } = await (await import("@/lib/supabase")).supabase.functions.invoke("search-products", {
      body: { query },
    });
    if (error || !Array.isArray(data?.candidates)) return [];
    return data.candidates as ProductCandidate[];
  },

  async lookupByBarcode(): Promise<ProductCandidate | null> {
    return null;
  },

  async findOffersForProduct(product): Promise<FetchedOffer[]> {
    const query = [product.brand, product.model_number || product.title]
      .filter(Boolean)
      .join(" ");

    const { data, error } = await (await import("@/lib/supabase")).supabase.functions.invoke("search-products", {
      body: { query, mode: "offers", product },
    });
    if (error || !Array.isArray(data?.offers)) return [];
    return data.offers as FetchedOffer[];
  },
};
