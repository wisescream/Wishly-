import type { ProviderAdapter } from "./types";
import type { ProductCandidate } from "@/types/database";

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

};
