import { describe, expect, it } from "vitest";
import { mapUpcItemDbOffer } from "./UpcItemDbProvider";

describe("UPCitemdb offer normalization", () => {
  it("does not turn missing shipping or taxes into a verified total", () => {
    expect(mapUpcItemDbOffer({ price: "29.99", link: "https://shop.example/item" })).toMatchObject({
      price: 29.99,
      shipping_cost: 0,
      shipping_known: false,
      taxes_known: false,
      total_price: null,
      total_is_estimated: true,
    });
  });

  it("retains explicit free shipping and rejects placeholder offers", () => {
    expect(mapUpcItemDbOffer({ price: "29.99", shipping: "Free Shipping", link: "https://shop.example/item" }))
      .toMatchObject({ shipping_cost: 0, shipping_known: true, total_price: null });
    expect(mapUpcItemDbOffer({ price: "0", link: "https://shop.example/item" })).toBeNull();
    expect(mapUpcItemDbOffer({ price: "29.99", link: "#" })).toBeNull();
  });
});
