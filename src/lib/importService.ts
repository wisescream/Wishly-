import { fetchProduct } from "@/lib/api";
import { searchGlobalProducts, lookupBarcodeGlobal } from "@/lib/providers";
import { supabase } from "@/lib/supabase";
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
    // Edge function failed or unavailable
  }

  // Preserve the source URL, but never invent a title or price from its slug.
  if (!fetched) {
    throw new Error("This site could not provide product metadata. Keep the source URL and enter the product details manually.");
  }

  const partialTitle = typeof fetched.title === "string" ? fetched.title : "";
  const encodedPath = parsed.pathname.split("/").filter(Boolean).pop() || "";
  let decodedPath = encodedPath;
  try { decodedPath = decodeURIComponent(encodedPath); } catch { /* Keep malformed but harmless path text encoded. */ }
  const fromPath = decodedPath
    .replace(/\.(?:html?|php)$/i, "").replace(/[-_]+/g, " ").replace(/\b\d{5,}\b/g, " ").trim();
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
    message: fetched.title
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

  let observedPrice: number | null = null;
  let observedCurrency = "USD";

  // Check if filename contains price pattern (e.g., "iPhone 15 799 USD")
  const priceMatch = detectedText.match(/(\$|€|£|MAD|د\.م\.)\s*(\d+[.,]?\d{0,2})|\b(\d+[.,]?\d{0,2})\s*(USD|EUR|GBP|MAD)\b/i);
  if (priceMatch) {
    const rawVal = parseFloat((priceMatch[2] || priceMatch[3] || "").replace(",", "."));
    if (!isNaN(rawVal) && rawVal > 0) {
      observedPrice = rawVal;
      const marker = `${priceMatch[1] || ""} ${priceMatch[4] || ""}`.toUpperCase();
      if (marker.includes("€") || marker.includes("EUR")) observedCurrency = "EUR";
      else if (marker.includes("£") || marker.includes("GBP")) observedCurrency = "GBP";
      else if (marker.includes("MAD") || marker.includes("د.م")) observedCurrency = "MAD";
    }
  }

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
    observedPrice,
    observedCurrency,
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
}): Promise<string> {
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

  // 2. Insert item into Wishlist
  const { data: newItem, error: itemError } = await supabase
    .from("items")
    .insert({
      wishlist_id: params.wishlistId,
      title: params.title,
      image_url: params.imageUrl || null,
      additional_images: params.additionalImages || [],
      description: params.description || null,
      category: params.category || null,
      variant_label: params.variantName || null,
      url: params.url || null,
      store: params.store || null,
      current_price: params.price && params.price > 0 ? params.price : null,
      original_price: params.originalPrice && params.originalPrice > 0 ? params.originalPrice : null,
      currency: params.currency || "USD",
      priority: params.priority ?? 2,
      notes: params.notes || null,
      status: "wanted",
      target_price: params.targetPrice && params.targetPrice > 0 ? params.targetPrice : null,
      position: 0,
      product_id: productId,
      variant_id: variantId,
      brand: params.brand || null,
      model_number: params.modelNumber || null,
      gtin: params.gtin || null,
      is_verified: params.isVerified ?? false,
      price_source: params.priceSource || "user_entered",
      enrichment_status: productId || params.gtin || params.modelNumber ? "processing" : "manual",
    })
    .select("id")
    .single();

  if (itemError || !newItem) {
    throw new Error(itemError?.message || "Failed to save item to wishlist");
  }

  // Record the user's original price as an unverified observation.
  if (params.price && params.price > 0) {
    try {
      await supabase.rpc("record_price_observation", {
        p_item_id: newItem.id,
        p_price: params.price,
        p_store: params.store || "Initial Listing",
        p_currency: params.currency || "USD",
        p_source: params.priceSource || "user_entered",
        p_source_url: params.url || null,
        p_is_verified: false,
      });
    } catch {
      // Non-blocking
    }
  }

  return newItem.id;
}
