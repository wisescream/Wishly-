import type { ProviderAdapter } from "./types";
import { InternalCatalogProvider } from "./InternalCatalogProvider";
import { MoroccanRetailersProvider } from "./MoroccanRetailersProvider";
import { UpcItemDbProvider } from "./UpcItemDbProvider";
import { OpenFoodFactsProvider } from "./OpenFoodFactsProvider";
import { GoogleShoppingProvider } from "./GoogleShoppingProvider";
import type { ProductCandidate } from "@/types/database";
import { evaluateProductMatch } from "../matching/productMatcher";

export const activeProviders: ProviderAdapter[] = [
  InternalCatalogProvider,
  MoroccanRetailersProvider,
  UpcItemDbProvider,
  OpenFoodFactsProvider,
  GoogleShoppingProvider,
];

/**
 * Searches all active providers by product name/query and ranks candidates
 */
export async function searchGlobalProducts(query: string): Promise<ProductCandidate[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const promises = activeProviders.map(async (p) => {
    try {
      return await p.searchByQuery(cleanQuery);
    } catch {
      return [];
    }
  });

  const nested = await Promise.all(promises);
  const allCandidates = nested.flat();

  // Deduplicate and re-score with product matcher
  const uniqueMap = new Map<string, ProductCandidate>();
  for (const c of allCandidates) {
    const key = (c.gtin || `${c.brand || ""}-${c.model_number || ""}-${c.title}`)
      .toLowerCase()
      .replace(/\s+/g, "");

    if (!uniqueMap.has(key)) {
      const matchEval = evaluateProductMatch(
        { title: cleanQuery, brand: null },
        { title: c.title, brand: c.brand, model_number: c.model_number, gtin: c.gtin }
      );
      uniqueMap.set(key, {
        ...c,
        confidence: matchEval.confidence,
        match_reason: matchEval.reason,
      });
    }
  }

  return Array.from(uniqueMap.values()).sort((a, b) => b.confidence - a.confidence);
}

/**
 * Looks up product across barcode providers (EAN/UPC/GTIN)
 */
export async function lookupBarcodeGlobal(barcode: string): Promise<ProductCandidate | null> {
  const clean = barcode.replace(/[^\d]/g, "");
  if (!clean) return null;

  for (const p of activeProviders) {
    try {
      const res = await p.lookupByBarcode(clean);
      if (res) return res;
    } catch {
      // try next provider
    }
  }

  return null;
}
