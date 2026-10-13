import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchProductMock, searchGlobalProductsMock, discoverOffersMock, supabaseFromMock } = vi.hoisted(() => ({
  fetchProductMock: vi.fn(),
  searchGlobalProductsMock: vi.fn(),
  discoverOffersMock: vi.fn(),
  supabaseFromMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ fetchProduct: fetchProductMock }));
vi.mock("@/lib/providers", () => ({
  searchGlobalProducts: searchGlobalProductsMock,
  discoverOffersForProduct: discoverOffersMock,
  lookupBarcodeGlobal: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() }, from: supabaseFromMock } }));

import { importFromUrl, saveImportedProductToWishlist } from "./importService";

describe("URL import search fallback", () => {
  beforeEach(() => { vi.clearAllMocks(); discoverOffersMock.mockResolvedValue([]); });

  it("searches a sanitized page slug but leaves product fields unfilled when fetching fails", async () => {
    const candidate = { title: "Nike Air Max 90", confidence: 0.72 };
    fetchProductMock.mockRejectedValueOnce(new Error("retailer blocked the request"));
    searchGlobalProductsMock.mockResolvedValueOnce([candidate]);

    const result = await importFromUrl("https://shop.example/products/nike-air-max-90-123456.html?color=white");

    expect(searchGlobalProductsMock).toHaveBeenCalledWith("nike air max 90");
    expect(result.candidates).toEqual([candidate]);
    expect(result.product).toMatchObject({
      title: "",
      price: null,
      currency: "",
      store: "shop.example",
      canonical_url: "https://shop.example/products/nike-air-max-90-123456.html?color=white",
    });
    expect(result.message).toContain("Verify the details");
  });

  it("preserves the link and offers manual entry when search has no candidates", async () => {
    fetchProductMock.mockRejectedValueOnce(new Error("retailer blocked the request"));
    searchGlobalProductsMock.mockResolvedValueOnce([]);

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
});

describe("condition-aware wishlist imports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    discoverOffersMock.mockResolvedValue([]);
    supabaseFromMock.mockImplementation(() => ({
      insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: "item-1" }, error: null }) })) })),
    }));
  });

  it("saves condition separately from the size/color variant label", async () => {
    const result = await saveImportedProductToWishlist({
      wishlistId: "wishlist-1",
      title: "Sony WH-1000XM5",
      variantName: "Black",
      condition: "Open-box",
    });
    expect(result).toEqual({ itemId: "item-1", isDuplicate: false });
    expect(supabaseFromMock).toHaveBeenCalledWith("items");
    expect(supabaseFromMock.mock.results[0].value.insert).toHaveBeenCalledWith(expect.objectContaining({
      variant_label: "Black",
      condition: "open_box",
    }));
  });
});
