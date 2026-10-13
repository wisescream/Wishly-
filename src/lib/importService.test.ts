import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchProductMock, searchGlobalProductsMock, lookupBarcodeMock, supabaseRpcMock, supabaseFromMock, supabaseInvokeMock, ProductImportRateLimitError } = vi.hoisted(() => ({
  fetchProductMock: vi.fn(),
  searchGlobalProductsMock: vi.fn(),
  lookupBarcodeMock: vi.fn(),
  supabaseRpcMock: vi.fn(),
  supabaseFromMock: vi.fn(),
  supabaseInvokeMock: vi.fn(),
  ProductImportRateLimitError: class ProductImportRateLimitError extends Error {},
}));

vi.mock("@/lib/api", () => ({
  fetchProduct: fetchProductMock,
  ProductImportRateLimitError,
}));
vi.mock("@/lib/providers", () => ({
  searchGlobalProducts: searchGlobalProductsMock,
  lookupBarcodeGlobal: lookupBarcodeMock,
}));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: supabaseInvokeMock }, rpc: supabaseRpcMock, from: supabaseFromMock } }));

import { importFromImage, importFromUrl, saveImportedProductToWishlist } from "./importService";

describe("product photo import", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the authenticated image-search function and does not treat the filename as OCR", async () => {
    const visualCandidate = { title: "Sony WH-1000XM5", source: "google_lens", confidence: 0.55 };
    supabaseInvokeMock.mockResolvedValueOnce({ data: { configured: true, candidates: [visualCandidate] }, error: null });
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "999 USD product photo.jpg", { type: "image/jpeg" });

    const result = await importFromImage(file);

    expect(result.detectedText).toBe("");
    expect(result.observedPrice).toBeNull();
    expect(result.observedCurrency).toBe("");
    expect(result.candidates).toEqual([visualCandidate]);
    expect(supabaseInvokeMock).toHaveBeenCalledOnce();
    expect(supabaseInvokeMock.mock.calls[0][0]).toBe("search-image");
    expect(supabaseInvokeMock.mock.calls[0][1].body.get("image")).toBe(file);
    expect(searchGlobalProductsMock).not.toHaveBeenCalled();
  });

  it("surfaces provider configuration and quota errors instead of returning empty matches", async () => {
    supabaseInvokeMock.mockResolvedValueOnce({ data: { configured: false, candidates: [] }, error: null });
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "photo.jpg", { type: "image/jpeg" });
    await expect(importFromImage(file)).rejects.toThrow("Image search is not configured");
  });

  it("shows the image provider's quota message from a non-2xx Edge Function response", async () => {
    supabaseInvokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: "Edge Function returned a non-2xx status code", context: new Response(JSON.stringify({ error: "Daily Shopping search budget reached." }), { status: 429 }) },
    });
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "photo.jpg", { type: "image/jpeg" });
    await expect(importFromImage(file)).rejects.toThrow("Daily Shopping search budget reached");
  });
});

describe("URL import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchGlobalProductsMock.mockResolvedValue([]);
  });

  it("uses a sanitized page slug as an editable preview when fetching fails", async () => {
    const candidate = { title: "Nike Air Max 90", confidence: 0.72 };
    fetchProductMock.mockRejectedValueOnce(new Error("retailer blocked the request"));
    searchGlobalProductsMock.mockResolvedValueOnce([candidate]);

    const result = await importFromUrl("https://shop.example/products/nike-air-max-90-123456.html?color=white");

    expect(searchGlobalProductsMock).toHaveBeenCalledWith("nike air max 90");
    expect(result.candidates).toEqual([candidate]);
    expect(result.product).toMatchObject({
      title: "nike air max 90",
      price: null,
      currency: "",
      store: "shop.example",
      canonical_url: "https://shop.example/products/nike-air-max-90-123456.html?color=white",
    });
    expect(result.message).toContain("Verify the details");
  });

  it("preserves the link and offers manual entry when search has no candidates", async () => {
    fetchProductMock.mockRejectedValueOnce(new Error("retailer blocked the request"));
    const result = await importFromUrl("https://shop.example/item/123456.html");

    expect(searchGlobalProductsMock).not.toHaveBeenCalled();
    expect(result.candidates).toEqual([]);
    expect(result.product.title).toBe("");
    expect(result.product.price).toBeNull();
    expect(result.product.canonical_url).toBe("https://shop.example/item/123456.html");
    expect(result.message).toContain("Verify the details");
  });

  it("rejects invalid schemes before fetching or searching", async () => {
    await expect(importFromUrl("javascript:alert(1)")).rejects.toThrow("valid http or https");
    expect(fetchProductMock).not.toHaveBeenCalled();
    expect(searchGlobalProductsMock).not.toHaveBeenCalled();
  });

  it("stops on a rate limit instead of spending fallback search quota", async () => {
    const limitError = new ProductImportRateLimitError("You have reached the URL import limit. Wait one minute and try again.");
    fetchProductMock.mockRejectedValueOnce(limitError);
    await expect(importFromUrl("https://shop.example/item/123456.html")).rejects.toThrow("Wait one minute");
    expect(searchGlobalProductsMock).not.toHaveBeenCalled();
  });

  it("defers deal research until after save even when URL metadata is available", async () => {
    fetchProductMock.mockResolvedValueOnce({
      title: "Sony WH-1000XM5",
      brand: "Sony",
      model_number: "WH-1000XM5",
      gtin: null,
      currency: "EUR",
      canonical_url: "https://shop.example/headphones",
    });

    const result = await importFromUrl("https://shop.example/headphones");

    expect(result.candidates).toEqual([]);
    expect(result.status).toBe("partial");
    expect(result.message).toContain("research starts after saving");
    expect(searchGlobalProductsMock).toHaveBeenCalledWith("Sony WH-1000XM5");
  });

  it("preserves the extracted canonical URL instead of overwriting it with the pasted redirect URL", async () => {
    fetchProductMock.mockResolvedValueOnce({
      title: "Sony WH-1000XM5",
      currency: "EUR",
      canonical_url: "https://shop.example/products/sony?utm_campaign=mail",
    });
    const result = await importFromUrl("https://shop.example/redirect/123?utm_source=newsletter");
    expect(result.product.canonical_url).toBe("https://shop.example/products/sony");
  });

  it("uses a safe extracted canonical URL for partial metadata too", async () => {
    fetchProductMock.mockResolvedValueOnce({
      title: null,
      canonical_url: "https://shop.example/products/item#details",
    });
    const result = await importFromUrl("https://shop.example/redirect/123");
    expect(result.product.canonical_url).toBe("https://shop.example/products/item");
  });
});

describe("condition-aware wishlist imports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseRpcMock.mockResolvedValue({ data: [{ item_id: "item-1", is_duplicate: false }], error: null });
  });

  it("saves through the owner-checked idempotent RPC and preserves selected variant details", async () => {
    const result = await saveImportedProductToWishlist({
      wishlistId: "wishlist-1",
      title: "Sony WH-1000XM5",
      variantName: "Black",
      variantDetails: { color: "Black", size: "US 8", capacity: "256 GB", sku: "SKU-1" },
      price: 299,
      originalPrice: 349,
      currency: "EUR",
      url: "https://shop.example/products/sony?utm_source=ad",
      condition: "Open-box",
    });
    expect(result).toEqual({ itemId: "item-1", isDuplicate: false });
    expect(supabaseRpcMock).toHaveBeenCalledWith("save_wishlist_item_once_with_condition", expect.objectContaining({
      p_wishlist_id: "wishlist-1",
      p_title: "Sony WH-1000XM5",
      p_variant_label: "Black · US 8 · 256 GB · SKU-1",
      p_url: "https://shop.example/products/sony",
      p_current_price: 299,
      p_original_price: 349,
      p_currency: "EUR",
      p_gtin: null,
      p_is_verified: false,
      p_price_source: "user_entered",
      p_condition: "open_box",
    }));
    expect(supabaseFromMock).not.toHaveBeenCalled();
    expect(searchGlobalProductsMock).not.toHaveBeenCalled();
  });

  it("returns the existing item when the RPC reports a duplicate", async () => {
    supabaseRpcMock.mockResolvedValueOnce({ data: [{ item_id: "existing-item", is_duplicate: true }], error: null });
    await expect(saveImportedProductToWishlist({ wishlistId: "wishlist-1", title: "Product" }))
      .resolves.toEqual({ itemId: "existing-item", isDuplicate: true });
  });

  it("surfaces owner/RLS errors instead of falling back to an unsafe direct insert", async () => {
    supabaseRpcMock.mockResolvedValueOnce({ data: null, error: { message: "Wishlist not found or not owned by the caller" } });
    await expect(saveImportedProductToWishlist({ wishlistId: "other-user-list", title: "Product" }))
      .rejects.toThrow("Wishlist not found or not owned by the caller");
    expect(supabaseFromMock).not.toHaveBeenCalled();
  });

  it("rejects malformed URLs and invalid GTINs before calling the save RPC", async () => {
    await expect(saveImportedProductToWishlist({ wishlistId: "wishlist-1", title: "Product", url: "javascript:alert(1)" }))
      .rejects.toThrow("valid http or https");
    await expect(saveImportedProductToWishlist({ wishlistId: "wishlist-1", title: "Product", gtin: "123456789013" }))
      .rejects.toThrow("valid GTIN");
    expect(supabaseRpcMock).not.toHaveBeenCalled();
  });
});
