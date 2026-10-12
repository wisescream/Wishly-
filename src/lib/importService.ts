import { fetchProduct } from "@/lib/api";
import { searchGlobalProducts, lookupBarcodeGlobal } from "@/lib/providers";
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

/**
 * Method A: Import using Product URL
 */
export async function importFromUrl(url: string): Promise<ImportResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) throw new Error();
  } catch {
    throw new Error("Enter a valid http or https product URL.");
  }
  let fetched: FetchedProduct | null = null;

  try {
    fetched = await fetchProduct(url);
  } catch {
    // Search providers may still find a candidate when the retailer blocks the
    // metadata fetch. The URL slug is only a query hint, never product data.
  }

  if (!fetched) {
    const searchHint = productUrlSearchHint(url);
    const candidates = searchHint.length > 2
      ? await searchGlobalProducts(searchHint).catch(() => [])
      : [];
    return {
      product: {
        title: "",
        image_url: null,
        additional_images: [],
        price: null,
        currency: "",
        store: parsed.hostname.replace(/^www\./i, ""),
        description: null,
        canonical_url: normalizeProductImportUrl(url) || url,
        source: "url_search_fallback",
        extraction_status: "failed",
      },
      candidates,
      offers: [],
      status: "partial",
      confidence: 0,
      message: candidates.length
        ? "The retailer page could not be read. Choose a search candidate only if it is the same product and variant; Wishly did not infer a title or price from the URL."
        : "The retailer page could not be read and no search candidates were found. The source link is preserved; enter product details manually.",
    };
  }

  const partialTitle = typeof fetched.title === "string" ? fetched.title : "";
  const fromPath = productUrlSearchHint(url);
  const query = [fetched.brand, fetched.model_number, partialTitle || fromPath].filter(Boolean).join(" ").slice(0, 240);
  const candidates = (!fetched.gtin && !(fetched.brand && fetched.model_number) && query.length > 2)
    ? await searchGlobalProducts(query).catch(() => [])
    : [];

  return {
    product: { ...fetched, title: partialTitle },
    candidates,
    offers: [],
    status: fetched.gtin ? "identified" : "partial",
    confidence: fetched.gtin ? 1 : fetched.model_number && fetched.brand ? 0.92 : fetched.title ? 0.65 : 0,
    message: fetched.price_conflict
      ? "The page reports conflicting prices or currencies. Confirm the current price and currency before saving."
      : fetched.title
      ? candidates.length ? "Page details are partial. Choose a search result if it is the exact model and variant." : undefined
      : candidates.length ? "The product page exposed little metadata. Choose the exact candidate or enter its details manually."
      : "The page responded, but Wishly could not identify a product name. Add or correct the details below.",
  };
}

/**
 * Method B: Search by Product Name
 */
export async function importByNameSearch(query: string): Promise<ProductCandidate[]> {
  return await searchGlobalProducts(query);
}

/**
 * Method C: Upload Product Image or Screenshot (with image analysis & candidate search)
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
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = (start: number, end: number) => String.fromCharCode(...signature.slice(start, end));
  const validImage =
    (signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff) ||
    (signature[0] === 0x89 && ascii(1, 4) === "PNG") ||
    ascii(0, 3) === "GIF" ||
    (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") ||
    (ascii(4, 8) === "ftyp" && /^(heic|heix|hevc|mif1|avif)/.test(ascii(8, 12)));
  if (!validImage) throw new Error("The file contents are not a supported image format.");
  // Create object URL for instant preview
  const previewUrl = URL.createObjectURL(file);

  let detectedText = "";
  const Detector = (window as Window & { TextDetector?: new () => { detect: (source: ImageBitmap) => Promise<Array<{ rawValue?: string }>> } }).TextDetector;
  if (Detector) {
    try {
      const bitmap = await createImageBitmap(file);
      const blocks = await new Detector().detect(bitmap);
      detectedText = blocks.map((block) => block.rawValue || "").join(" ").trim();
      bitmap.close();
    } catch {
      // OCR is optional and browser support varies; name search/manual entry remains available.
    }
  }
  const nameHint = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").replace(/\b(screenshot|photo|image|img_\d+)\b/ig, "").trim();
  const searchTerms = detectedText || nameHint;

  const imagePrice = parseImagePrice(detectedText);

  // Google Lens searches the image itself; OCR text also feeds the normal catalog search.
  const imageCandidates = await searchGlobalImage(file).catch(() => [] as ProductCandidate[]);
  const textCandidates = searchTerms.length > 2 ? await searchGlobalProducts(searchTerms).catch(() => []) : [];
  const byKey = new Map<string, ProductCandidate>();
  for (const candidate of [...imageCandidates, ...textCandidates]) {
    const key = `${candidate.title.toLowerCase()}|${candidate.url || ""}`;
    if (!byKey.has(key)) byKey.set(key, candidate);
  }
  const candidates = [...byKey.values()].slice(0, 12);

  return {
    detectedText,
    observedPrice: imagePrice.amount,
    observedCurrency: imagePrice.currency || "",
    priceCurrencyAmbiguous: imagePrice.currencyAmbiguous,
    candidates,
    previewUrl,
  };
}

async function searchGlobalImage(file: File): Promise<ProductCandidate[]> {
  const makeJpeg = async (): Promise<Blob> => {
    if (file.type === "image/jpeg" && file.size <= 480 * 1024) return file;
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image optimization is unavailable.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.68, 0.54, 0.4]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (blob && blob.size <= 480 * 1024) return blob;
      }
      throw new Error("Image is too large to search.");
    } finally { bitmap.close(); }
  };
  const blob = await makeJpeg();
  const form = new FormData();
  form.append("image", blob, "wishly-upload.jpg");
  const { data, error } = await supabase.functions.invoke("search-image", { body: form });
  if (error) throw error;
  return Array.isArray(data?.candidates) ? data.candidates as ProductCandidate[] : [];
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

  return { candidate, offers: [] };
}

export function isValidGtin(value: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(value)) return false;
  const digits = [...value].map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Saves a product and its offers to Supabase, linking canonical catalog records
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
  if (params.gtin && !isValidGtin(params.gtin.replace(/\D/g, ""))) {
    throw new Error("Enter a valid GTIN/EAN/UPC check digit or remove the identifier.");
  }
  let productId: string | null = null;
  let variantId: string | null = null;

  // Resolve shared identity through a JWT-verified Edge Function. The public
  // client must not write to the shared catalog with elevated privileges.
  if (params.title && (params.gtin || (params.brand && params.modelNumber))) {
    try {
      const { data } = await supabase.functions.invoke("resolve-product", {
        body: {
          title: params.title,
          brand: params.brand || null,
          model_number: params.modelNumber || null,
          gtin: params.gtin || null,
          image_url: params.imageUrl || null,
          additional_images: params.additionalImages || [],
          description: params.description || null,
          category: params.category || null,
          variant_name: params.variantName || null,
          variant_details: params.variantDetails || null,
        },
      });
      productId = data?.product_id || null;
      variantId = data?.variant_id || null;
    } catch {
      // The wishlist item remains savable when catalog enrichment is down.
    }
  }

  // The RPC checks ownership and serializes same-wishlist imports so duplicate
  // submits return the existing row instead of creating another item.
  const { data: savedRows, error: itemError } = await supabase.rpc("save_wishlist_item_once_with_condition", {
    p_wishlist_id: params.wishlistId,
    p_title: params.title,
    p_image_url: params.imageUrl || null,
    p_additional_images: params.additionalImages || [],
    p_description: params.description || null,
    p_category: params.category || null,
    p_variant_label: params.variantName || null,
    p_url: normalizeProductImportUrl(params.url) || params.url?.trim() || null,
    p_store: params.store || null,
    p_current_price: params.price && params.price > 0 ? params.price : null,
    p_original_price: params.originalPrice && params.originalPrice > 0 ? params.originalPrice : null,
    p_currency: params.currency || "USD",
    p_priority: params.priority ?? 2,
    p_notes: params.notes || null,
    p_target_price: params.targetPrice && params.targetPrice > 0 ? params.targetPrice : null,
    p_product_id: productId,
    p_variant_id: variantId,
    p_brand: params.brand || null,
    p_model_number: params.modelNumber || null,
    p_gtin: params.gtin ? params.gtin.replace(/\D/g, "") : null,
    p_is_verified: params.isVerified ?? false,
    p_price_source: params.priceSource || "user_entered",
    p_condition: normalizeProductCondition(params.condition),
  });
  const saved = savedRows?.[0];
  if (itemError || !saved) throw new Error(itemError?.message || "Failed to save item to wishlist");

  return { itemId: saved.item_id, isDuplicate: saved.is_duplicate };
}
