import { fetchProduct } from "@/lib/api";
import { searchGlobalProducts, lookupBarcodeGlobal, discoverOffersForProduct } from "@/lib/providers";
import { supabase } from "@/lib/supabase";
import { normalizeProductImportUrl, productUrlSearchHint } from "@/lib/importIdentity";
import { parseImagePrice } from "@/lib/imagePrice";
import { normalizeProductCondition } from "@/lib/productCondition";
import type {
  FetchedProduct,
  ProductCandidate,
  FetchedOffer,
  EnrichmentStatus,
} from "@/types/database";

export interface ImportResult {
  product: FetchedProduct;
  candidates: ProductCandidate[];
  offers: FetchedOffer[];
  status: EnrichmentStatus;
  confidence: number;
  message?: string;
}

const COMMON_BRANDS = [
  "Apple", "Samsung", "Sony", "Nike", "Adidas", "Zara", "IKEA", "KitchenAid",
  "Nespresso", "Logitech", "Anker", "Xiaomi", "Huawei", "Lenovo", "Dell", "HP",
  "Asus", "Acer", "LG", "Philips", "Bosch", "Moulinex", "Tefal", "Whirlpool",
  "Sephora", "L'Oreal", "Dyson", "PlayStation", "Xbox", "Nintendo", "Canon"
];

/**
 * Extracts store, currency, brand, and title hints directly from URL structure
 */
export function extractProductInfoFromUrl(url: string): {
  store: string;
  currency: string;
  brand: string | null;
  title: string;
} {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    let store = host;
    let currency = "USD";
    let brand: string | null = null;

    if (host.includes("jumia.ma")) {
      store = "Jumia Maroc";
      currency = "MAD";
    } else if (host.includes("marjanemall.ma") || host.includes("marjane.ma")) {
      store = "Marjane Mall";
      currency = "MAD";
    } else if (host.includes("electroplanet.ma")) {
      store = "Electroplanet";
      currency = "MAD";
    } else if (host.includes("cosmos.ma")) {
      store = "Cosmos Electro";
      currency = "MAD";
    } else if (host.includes("virginmegastore.ma")) {
      store = "Virgin Megastore Maroc";
      currency = "MAD";
    } else if (host.includes("ikea.ma") || (host.includes("ikea.com") && parsed.pathname.includes("/ma/"))) {
      store = "IKEA Maroc";
      currency = "MAD";
      brand = "IKEA";
    } else if (host.includes("zara.com") && parsed.pathname.includes("/ma/")) {
      store = "Zara Maroc";
      currency = "MAD";
      brand = "Zara";
    } else if (host.includes("decathlon.ma")) {
      store = "Decathlon Maroc";
      currency = "MAD";
    } else if (host.endsWith(".ma")) {
      currency = "MAD";
    } else if (host.endsWith(".fr") || host.endsWith(".de") || host.endsWith(".es")) {
      currency = "EUR";
    } else if (host.endsWith(".co.uk")) {
      currency = "GBP";
    }

    const titleHint = productUrlSearchHint(url);

    // Check for recognizable brand in the URL hint
    for (const b of COMMON_BRANDS) {
      if (new RegExp(`\\b${b}\\b`, "i").test(titleHint)) {
        brand = b;
        break;
      }
    }

    return {
      store,
      currency,
      brand,
      title: titleHint || `Product from ${store}`,
    };
  } catch {
    return {
      store: "Online Store",
      currency: "USD",
      brand: null,
      title: "Imported Product",
    };
  }
}

/**
 * Method A: Import using Product URL
 */
export async function importFromUrl(url: string): Promise<ImportResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) throw new Error();
  } catch {
    throw new Error("Enter a valid http or https product URL.");
  }

  let fetched: FetchedProduct | null = null;

  try {
    fetched = await fetchProduct(url);
  } catch {
    // Edge function failed or unavailable; fallback below
  }

  const urlFallback = extractProductInfoFromUrl(url);

  // If fetch failed or returned empty title, use URL fallback
  if (!fetched || !fetched.title) {
    const finalTitle = fetched?.title || urlFallback.title;
    const finalBrand = fetched?.brand || urlFallback.brand;
    const finalCurrency = fetched?.currency || urlFallback.currency;
    const finalStore = fetched?.store || urlFallback.store;

    // Search for candidates and offers across Moroccan & international retailers
    const [candidates, offers] = await Promise.all([
      finalTitle.length > 2 ? searchGlobalProducts(finalTitle).catch(() => []) : Promise.resolve([]),
      discoverOffersForProduct({
        title: finalTitle,
        brand: finalBrand,
        model_number: null,
        gtin: null,
      }).catch(() => []),
    ]);

    return {
      product: {
        title: finalTitle,
        image_url: fetched?.image_url || null,
        additional_images: fetched?.additional_images || [],
        price: fetched?.price || null,
        currency: finalCurrency,
        store: finalStore,
        description: fetched?.description || null,
        brand: finalBrand,
        model_number: null,
        gtin: null,
        canonical_url: normalizeProductImportUrl(url) || url,
        source: "url_import",
        extraction_status: "partial",
      },
      candidates,
      offers,
      status: offers.length ? "offers_available" : "partial",
      confidence: 0.65,
      message: offers.length
        ? `Product imported from ${finalStore}. Discovered offers in Moroccan & global stores below.`
        : "Product imported from link. Verify the details below.",
    };
  }

  const effectiveTitle = fetched.title;
  const effectiveBrand = fetched.brand || urlFallback.brand;
  const effectiveCurrency = fetched.currency || urlFallback.currency;
  const effectiveStore = fetched.store || urlFallback.store;

  // Search for matching offers across Moroccan retailers and global marketplaces
  const [candidates, offers] = await Promise.all([
    !fetched.gtin && effectiveTitle.length > 2
      ? searchGlobalProducts(effectiveTitle).catch(() => [])
      : Promise.resolve([]),
    discoverOffersForProduct({
      title: effectiveTitle,
      brand: effectiveBrand,
      model_number: fetched.model_number,
      gtin: fetched.gtin,
    }).catch(() => []),
  ]);

  return {
    product: {
      ...fetched,
      title: effectiveTitle,
      brand: effectiveBrand,
      currency: effectiveCurrency,
      store: effectiveStore,
      canonical_url: normalizeProductImportUrl(url) || url,
    },
    candidates,
    offers,
    status: fetched.gtin ? "identified" : offers.length > 0 ? "offers_available" : "partial",
    confidence: fetched.gtin ? 1 : effectiveBrand && fetched.model_number ? 0.92 : 0.85,
    message: offers.length
      ? `Product imported. Found ${offers.length} matching offers across Moroccan and international stores.`
      : "Product details imported successfully. Review details below.",
  };
}

/**
 * Method B: Search by Product Name
 */
export async function importByNameSearch(query: string): Promise<ProductCandidate[]> {
  return await searchGlobalProducts(query);
}

/**
 * Method C: Upload Product Image or Screenshot
 */
export async function importFromImage(file: File): Promise<{
  detectedText: string;
  observedPrice: number | null;
  observedCurrency: string;
  priceCurrencyAmbiguous: boolean;
  candidates: ProductCandidate[];
  previewUrl: string;
}> {
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
    throw new Error("Choose an image under 10 MB.");
  }

  const previewUrl = URL.createObjectURL(file);
  let detectedText = "";

  const nameHint = file.name
    .replace(/\.[^/.]+$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b(screenshot|photo|image|img_\d+)\b/gi, "")
    .trim();

  const searchTerms = detectedText || nameHint;
  const imagePrice = parseImagePrice(searchTerms);

  const candidates = searchTerms.length > 2
    ? await searchGlobalProducts(searchTerms).catch(() => [])
    : [];

  return {
    detectedText,
    observedPrice: imagePrice.amount,
    observedCurrency: imagePrice.currency || "MAD",
    priceCurrencyAmbiguous: imagePrice.currencyAmbiguous,
    candidates,
    previewUrl,
  };
}

/**
 * Method D: Barcode Scan / Lookup (EAN/UPC/GTIN)
 */
export async function importFromBarcode(barcode: string): Promise<{
  candidate: ProductCandidate | null;
  offers: FetchedOffer[];
  error?: string;
}> {
  const clean = barcode.replace(/[^\d]/g, "");
  if (!isValidGtin(clean)) {
    return { candidate: null, offers: [], error: "Please enter a valid 8, 12, 13, or 14-digit GTIN barcode." };
  }

  const candidate = await lookupBarcodeGlobal(clean);

  if (!candidate) {
    return {
      candidate: null,
      offers: [],
      error: `No exact product found in global barcode databases for GTIN ${clean}. You can enter details manually.`,
    };
  }

  const offers = await discoverOffersForProduct({
    title: candidate.title,
    brand: candidate.brand,
    model_number: candidate.model_number,
    gtin: candidate.gtin,
  }).catch(() => []);

  return { candidate, offers };
}

export function isValidGtin(value: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(value)) return false;
  const digits = [...value].map(Number);
  const check = digits.pop()!;
  const sum = digits
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Saves a product and its offers to Supabase directly with full RLS support
 */
export async function saveImportedProductToWishlist(params: {
  wishlistId: string;
  title: string;
  imageUrl?: string | null;
  additionalImages?: string[];
  url?: string | null;
  store?: string | null;
  price?: number | null;
  originalPrice?: number | null;
  currency?: string;
  brand?: string | null;
  modelNumber?: string | null;
  gtin?: string | null;
  variantName?: string | null;
  variantDetails?: { color?: string; size?: string; capacity?: string; sku?: string };
  description?: string | null;
  category?: string | null;
  priority?: number;
  notes?: string | null;
  targetPrice?: number | null;
  isVerified?: boolean;
  priceSource?: string;
  condition?: string;
  offers?: FetchedOffer[];
}): Promise<{ itemId: string; isDuplicate: boolean }> {
  const cleanGtin = params.gtin ? params.gtin.replace(/\D/g, "") : null;
  const normalizedUrl = normalizeProductImportUrl(params.url) || params.url?.trim() || null;

  // 1. Check for duplicate in the same wishlist
  if (normalizedUrl) {
    const { data: existingUrl } = await supabase
      .from("items")
      .select("id")
      .eq("wishlist_id", params.wishlistId)
      .eq("url", normalizedUrl)
      .limit(1);

    if (existingUrl && existingUrl.length > 0) {
      return { itemId: existingUrl[0].id, isDuplicate: true };
    }
  }

  // 2. Insert item into items table
  const { data: newItem, error: itemError } = await supabase
    .from("items")
    .insert({
      wishlist_id: params.wishlistId,
      title: params.title.trim(),
      image_url: params.imageUrl || null,
      url: normalizedUrl,
      store: params.store || null,
      current_price: params.price && params.price > 0 ? params.price : null,
      currency: params.currency || "MAD",
      priority: params.priority ?? 2,
      notes: params.notes || null,
      status: "wanted",
      target_price: params.targetPrice && params.targetPrice > 0 ? params.targetPrice : null,
      position: 0,
      brand: params.brand || null,
      model_number: params.modelNumber || null,
      gtin: cleanGtin,
      is_verified: params.isVerified ?? false,
      enrichment_status: params.isVerified ? "offers_available" : "manual",
    })
    .select("id")
    .single();

  if (itemError || !newItem) {
    throw new Error(itemError?.message || "Failed to save item to wishlist");
  }

  // 3. Search and save Moroccan & international offers
  let offersToSave = params.offers || [];
  if (offersToSave.length === 0) {
    try {
      offersToSave = await discoverOffersForProduct({
        title: params.title,
        brand: params.brand,
        model_number: params.modelNumber,
        gtin: cleanGtin,
      });
    } catch {
      // Non-blocking
    }
  }

  if (offersToSave.length > 0) {
    try {
      const offerRows = offersToSave.map((o) => ({
        item_id: newItem.id,
        store: o.store,
        price: o.price || 0,
        currency: o.currency || "MAD",
        shipping_cost: o.shipping_cost || 0,
        taxes: o.taxes || 0,
        total_price: o.total_price || o.price || 0,
        condition: o.condition || "new",
        availability: o.availability || "in_stock",
        delivery_estimate: o.delivery_estimate || null,
        source: o.source || "scraper",
        url: o.url,
        affiliate_url: o.affiliate_url || null,
        last_verified_at: o.last_verified_at || new Date().toISOString(),
      }));

      await supabase.from("store_offers").insert(offerRows);
    } catch {
      // Non-blocking
    }
  }

  // 4. Record initial price point
  if (params.price && params.price > 0) {
    try {
      await supabase.from("price_points").insert({
        item_id: newItem.id,
        price: params.price,
        store: params.store || "Initial Listing",
      });
    } catch {
      // Non-blocking
    }
  }

  return { itemId: newItem.id, isDuplicate: false };
}

/**
 * Refreshes offers for an item on demand by searching Moroccan and international stores
 */
export async function refreshOffersForItem(itemId: string): Promise<FetchedOffer[]> {
  const { data: item, error } = await supabase
    .from("items")
    .select("id, title, brand, model_number, gtin, current_price, currency, store")
    .eq("id", itemId)
    .single();

  if (error || !item) throw new Error("Item not found");

  const offers = await discoverOffersForProduct({
    title: item.title,
    brand: item.brand,
    model_number: item.model_number,
    gtin: item.gtin,
  });

  if (offers.length > 0) {
    // Delete old offers and save fresh ones
    await supabase.from("store_offers").delete().eq("item_id", itemId);

    const offerRows = offers.map((o) => ({
      item_id: itemId,
      store: o.store,
      price: o.price || 0,
      currency: o.currency || "MAD",
      shipping_cost: o.shipping_cost || 0,
      taxes: o.taxes || 0,
      total_price: o.total_price || o.price || 0,
      condition: o.condition || "new",
      availability: o.availability || "in_stock",
      delivery_estimate: o.delivery_estimate || null,
      source: o.source || "scraper",
      url: o.url,
      affiliate_url: o.affiliate_url || null,
      last_verified_at: new Date().toISOString(),
    }));

    await supabase.from("store_offers").insert(offerRows);
  }

  return offers;
}
