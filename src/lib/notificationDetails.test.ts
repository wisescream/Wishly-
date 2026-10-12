import { describe, expect, it } from "vitest";
import { getNotificationAlertDetails } from "./notificationDetails";

describe("notification alert detail validation", () => {
  it("extracts safe offer, item, variant, and price details", () => {
    expect(getNotificationAlertDetails({
      item_id: "550e8400-e29b-41d4-a716-446655440000",
      url: "https://retailer.example/item?ref=wishly",
      variant: "Black · 128 GB",
      condition: "open_box",
      price: 79.99,
      old_price: 100,
      savings: 20.01,
      currency: "eur",
      verified_at: "2026-10-12T11:00:00.000Z",
    })).toEqual({
      itemId: "550e8400-e29b-41d4-a716-446655440000",
      offerUrl: "https://retailer.example/item?ref=wishly",
      variant: "Black · 128 GB",
      condition: "open_box",
      price: 79.99,
      oldPrice: 100,
      savings: 20.01,
      currency: "EUR",
      verifiedAt: "2026-10-12T11:00:00.000Z",
    });
  });

  it("rejects unsafe links and malformed detail values", () => {
    expect(getNotificationAlertDetails({
      item_id: "not-an-id",
      url: "javascript:alert(1)",
      variant: 123,
      condition: { strange: "value" },
      price: -1,
      old_price: "100",
      savings: Number.POSITIVE_INFINITY,
      currency: "US$",
      verified_at: "yesterday-ish",
    })).toEqual({
      itemId: null,
      offerUrl: null,
      variant: null,
      condition: null,
      price: null,
      oldPrice: null,
      savings: null,
      currency: null,
      verifiedAt: null,
    });
  });
});
