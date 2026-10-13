import { fetchProduct, ProductImportRateLimitError } from "@/lib/api";
import { searchGlobalProducts, lookupBarcodeGlobal } from "@/lib/providers";
import { supabase } from "@/lib/supabase";
import { normalizeProductImportUrl, productUrlSearchHint } from "@/lib/importIdentity";
import { parseImagePrice } from "@/lib/imagePrice";
import { normalizeProductCondition } from "@/lib/productCondition";
import type {
  FetchedProduct,
  ProductCandidate,
  EnrichmentStatus,
} from "@/types/database";

export interface ImportResult {
  product: FetchedProduct;
  candidates: ProductCandidate[];
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
    let currency = "";
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
    } else if (host === "amazon.com" || host === "walmart.com" || host === "target.com") {
      currency = "USD";
    } else if (host === "amazon.ca" || host === "simons.ca") {
      currency = "CAD";
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
      title: titleHint,
    };
  } catch {
    return {
      store: "Online Store",
      currency: "USD",
      brand: null,
      title: "",
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
  } catch (error) {
    if (error instanceof ProductImportRateLimitError) throw error;
    // Edge function failed or unavailable; fallback below
  }

  const urlFallback = extractProductInfoFromUrl(url);

  // If fetch failed or returned empty title, use URL fallback
  if (!fetched || !fetched.title) {
    const finalTitle = fetched?.title || "";
    const searchTitle = finalTitle || urlFallback.title;
    const finalBrand = fetched?.brand || null;
    const finalCurrency = fetched?.currency || urlFallback.currency;
    const finalStore = fetched?.store || urlFallback.store;
    const canonicalUrl = normalizeProductImportUrl(fetched?.canonical_url) || normalizeProductImportUrl(url) || url;

    // Product identification can offer candidates for explicit selection. Deal
    // research starts in the durable scheduled worker after the item is saved.
    const candidates = searchTitle.length > 2 ? await searchGlobalProducts(searchTitle).catch(() => []) : [];

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
        canonical_url: canonicalUrl,
        source: "url_import",
        extraction_status: "partial",
      },
      candidates,
      status: "partial",
      confidence: 0.65,
      message: "Product details could not be read from this retailer. Verify the details below; retailer research starts after saving.",
    };
  }

  const effectiveTitle = fetched.title;
  const effectiveBrand = fetched.brand || urlFallback.brand;
  const effectiveCurrency = fetched.currency || urlFallback.currency;
  const effectiveStore = fetched.store || urlFallback.store;
  const canonicalUrl = normalizeProductImportUrl(fetched.canonical_url) || normalizeProductImportUrl(url) || url;

  // Candidate identification is separate from durable deal research. Avoid
  // searching and presenting unverified retailer snippets before the item is saved.
  const candidates = !fetched.gtin && effectiveTitle.length > 2
    ? await searchGlobalProducts(effectiveTitle).catch(() => [])
    : [];

  return {
    product: {
      ...fetched,
      title: effectiveTitle,
      brand: effectiveBrand,
      currency: effectiveCurrency,
      store: effectiveStore,
      canonical_url: canonicalUrl,
    },
    candidates,
    status: fetched.gtin ? "identified" : "partial",
    confidence: fetched.gtin ? 1 : effectiveBrand && fetched.model_number ? 0.92 : 0.85,
    message: "Product details imported. Review them below; retailer research starts after saving.",
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
}> {
  if (file.size <= 0 || file.size > 10 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose an image under 10 MB.");
  }

  let upload = file;
  if (file.size > 480 * 1024) {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare this image for search.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let blob: Blob | null = null;
      for (const quality of [0.86, 0.72, 0.58, 0.45]) {
        blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (blob && blob.size <= 480 * 1024) break;
      }
      if (!blob || blob.size > 500 * 1024) throw new Error("This image is too large to search. Choose a smaller image or crop it first.");
      upload = new File([blob], "wishly-product-image.jpg", { type: "image/jpeg" });
    } finally { bitmap.close(); }
  }

  const form = new FormData();
  form.append("image", upload);
  const { data, error } = await supabase.functions.invoke("search-image", { body: form });
  if (error) {
    let message = typeof data?.error === "string" ? data.error : error.message || "Image search is temporarily unavailable.";
    if (error.context instanceof Response) {
      try {
        const payload = await error.context.clone().json() as { error?: unknown };
        if (typeof payload.error === "string" && payload.error.trim()) message = payload.error;
      } catch { /* Keep the SDK message if the response body is not JSON. */ }
    }
    throw new Error(message);
  }
  if (data?.configured === false) throw new Error(data.error || "Image search is not configured.");
  if (!data?.configured) throw new Error("Image search returned an invalid response.");
  if (typeof data.error === "string" && data.error) throw new Error(data.error);
  const candidates = Array.isArray(data.candidates) ? data.candidates as ProductCandidate[] : [];
  const detectedText = typeof data.detected_text === "string" ? data.detected_text : "";
  const imagePrice = parseImagePrice(detectedText);

  return {
    detectedText,
    observedPrice: imagePrice.amount,
    observedCurrency: imagePrice.currency || "",
    priceCurrencyAmbiguous: imagePrice.currencyAmbiguous,
    candidates,
  };
}

/**
 * Method D: Barcode Scan / Lookup (EAN/UPC/GTIN)
 */
export async function importFromBarcode(barcode: string): Promise<{
  candidate: ProductCandidate | null;
  error?: string;
}> {
  const clean = barcode.replace(/[^\d]/g, "");
  if (!isValidGtin(clean)) {
    return { candidate: null, error: "Please enter a valid 8, 12, 13, or 14-digit GTIN barcode." };
  }

  const candidate = await lookupBarcodeGlobal(clean);

  if (!candidate) {
    return {
      candidate: null,
      error: `No exact product found in global barcode databases for GTIN ${clean}. You can enter details manually.`,
    };
  }

  return { candidate };
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

function buildVariantLabel(
  name: string | null | undefined,
  details: { color?: string; size?: string; capacity?: string; sku?: string } | undefined,
): string | null {
  const parts = [name, details?.color, details?.size, details?.capacity, details?.sku]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  const unique = [...new Set(parts)];
  return unique.length ? unique.join(" · ") : null;
}

/**
 * Saves a wishlist item through the owner-checked, idempotent database RPC.
 * Durable retailer research is queued by the scheduled worker after this returns.
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
}): Promise<{ itemId: string; isDuplicate: boolean }> {
  if (!params.title.trim()) throw new Error("Product name is required");
  const rawGtin = params.gtin?.trim() || "";
  const cleanGtin = rawGtin ? rawGtin.replace(/\D/g, "") : null;
  if (rawGtin && (!cleanGtin || !isValidGtin(cleanGtin))) throw new Error("Enter a valid GTIN barcode or clear the identifier field.");
  const rawUrl = params.url?.trim() || "";
  const normalizedUrl = rawUrl ? normalizeProductImportUrl(rawUrl) : null;
  if (rawUrl && !normalizedUrl) throw new Error("Enter a valid http or https product URL.");
  const { data, error } = await supabase.rpc("save_wishlist_item_once_with_condition", {
    p_wishlist_id: params.wishlistId,
    p_title: params.title.trim(),
    p_image_url: params.imageUrl || null,
    p_additional_images: params.additionalImages || [],
    p_description: params.description || null,
    p_category: params.category || null,
    p_variant_label: buildVariantLabel(params.variantName, params.variantDetails),
    p_url: normalizedUrl,
    p_store: params.store || null,
    p_current_price: params.price && params.price > 0 ? params.price : null,
    p_original_price: params.originalPrice && params.originalPrice > 0 ? params.originalPrice : null,
    p_currency: params.currency || "MAD",
    p_priority: params.priority ?? 2,
    p_notes: params.notes || null,
    p_target_price: params.targetPrice && params.targetPrice > 0 ? params.targetPrice : null,
    p_product_id: null,
    p_variant_id: null,
    p_brand: params.brand || null,
    p_model_number: params.modelNumber || null,
    p_gtin: cleanGtin,
    p_is_verified: params.isVerified ?? false,
    p_price_source: params.priceSource || "user_entered",
    p_condition: normalizeProductCondition(params.condition),
  });
  if (error) throw new Error(error.message || "Failed to save item to wishlist");
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.item_id) throw new Error("Wishlist save returned no item identifier");
  return { itemId: result.item_id, isDuplicate: result.is_duplicate === true };
}
