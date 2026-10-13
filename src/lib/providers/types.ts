import type { ProductCandidate } from "@/types/database";

export interface ProviderAdapter {
  id: string;
  name: string;
  isAvailable: () => boolean;
  searchByQuery: (query: string) => Promise<ProductCandidate[]>;
  lookupByBarcode: (barcode: string) => Promise<ProductCandidate | null>;
}
