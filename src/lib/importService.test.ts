import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchProductMock, searchGlobalProductsMock, rpcMock } = vi.hoisted(() => ({
  fetchProductMock: vi.fn(),
  searchGlobalProductsMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ fetchProduct: fetchProductMock }));
vi.mock("@/lib/providers", () => ({
  searchGlobalProducts: searchGlobalProductsMock,
  lookupBarcodeGlobal: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() }, rpc: rpcMock } }));

import { importFromUrl, saveImportedProductToWishlist } from "./importService";

describe("URL import search fallback", () => {
  beforeEach(() => vi.clearAllMocks());

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
    expect(result.message).toContain("did not infer a title or price");
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
    expect(result.message).toContain("enter product details manually");
  });

  it("rejects invalid schemes before fetching or searching", async () => {
    await expect(importFromUrl("javascript:alert(1)")).rejects.toThrow("valid http or https");
    expect(fetchProductMock).not.toHaveBeenCalled();
    expect(searchGlobalProductsMock).not.toHaveBeenCalled();
  });
});

describe("condition-aware wishlist imports", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves condition separately from the size/color variant label", async () => {
    rpcMock.mockResolvedValueOnce({ data: [{ item_id: "item-1", is_duplicate: false }], error: null });
    await saveImportedProductToWishlist({
      wishlistId: "wishlist-1",
      title: "Sony WH-1000XM5",
      variantName: "Black",
      condition: "Open-box",
    });
    expect(rpcMock).toHaveBeenCalledWith("save_wishlist_item_once_with_condition", expect.objectContaining({
      p_variant_label: "Black",
      p_condition: "open_box",
    }));
  });
});
