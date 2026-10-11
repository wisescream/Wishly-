import type { ProductCandidate, FetchedOffer } from "@/types/database";

export interface ProviderAdapter {
  id: string;
  name: string;
  isAvailable: () => boolean;
  searchByQuery: (query: string) => Promise<ProductCandidate[]>;
  lookupByBarcode: (barcode: string) => Promise<ProductCandidate | null>;
  findOffersForProduct: (product: {
    title: string;
    brand?: string | null;
    model_number?: string | null;
    gtin?: string | null;
  }) => Promise<FetchedOffer[]>;
}
