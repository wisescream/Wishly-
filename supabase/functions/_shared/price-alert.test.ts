import { describe, expect, it } from "vitest";
import { getAlertDeduplicationKey, getAlertObservation, getAlertSourceLabel, isBackInStockAlert } from "./price-alert";

const now = Date.parse("2026-10-11T12:00:00.000Z");
const base = { id: "offer-1", is_verified: true, price: 90, total_price: null, currency: "MAD", condition: "new", availability: "unknown", last_verified_at: new Date(now).toISOString(), total_is_estimated: true, product_match_confidence: 0.95 };
const item = { current_price: 100, target_price: null, currency: "MAD", condition: "new", price_drop_percent: null, alert_on_any_lower_price: false, alert_on_new_cheaper_offer: false, alert_on_back_in_stock: false };

describe("price alert observations", () => {
  it("alerts on a fresh same-currency lower listing while labeling incomplete totals", () => {
    const observation = getAlertObservation({ ...item, alert_on_any_lower_price: true }, base, now);
    expect(observation).toMatchObject({ price: 90, completeTotal: false, target: false, reason: "lower-than-original" });
  });

  it("uses a complete total for target alerts and blocks mismatched currency or stale offers", () => {
    const complete = { ...base, total_price: 70, total_is_estimated: false };
    expect(getAlertObservation({ ...item, target_price: 75 }, complete, now)?.completeTotal).toBe(true);
    expect(getAlertObservation({ ...item, target_price: 75, currency: "EUR" }, complete, now)).toBeNull();
    expect(getAlertObservation({ ...item, target_price: 75 }, { ...complete, last_verified_at: new Date(now - 25 * 60 * 60 * 1000).toISOString() }, now)).toBeNull();
  });

  it("deduplicates unchanged observations by price and event reason", () => {
    const observation = getAlertObservation({ ...item, target_price: 95 }, base, now)!;
    expect(getAlertDeduplicationKey("item-1", base, observation)).toBe(getAlertDeduplicationKey("item-1", base, observation));
    expect(getAlertDeduplicationKey("item-1", base, observation)).not.toBe(getAlertDeduplicationKey("item-1", { ...base, price: 89 }, { ...observation, price: 89 }));
  });

  it("does not trigger an alert for an unconfirmed possible product match", () => {
    expect(getAlertObservation({ ...item, alert_on_any_lower_price: true }, { ...base, product_match_confidence: 0.88 }, now)).toBeNull();
  });

  it("does not alert on fresh but unverified provider prices", () => {
    expect(getAlertObservation({ ...item, target_price: 95 }, { ...base, is_verified: false }, now)).toBeNull();
    expect(isBackInStockAlert({ ...item, alert_on_back_in_stock: true }, { ...base, is_verified: false, availability: "in_stock" }, "out_of_stock", now)).toBe(false);
  });

  it("requires the exact saved condition before price or restock alerts", () => {
    expect(getAlertObservation({ ...item, target_price: 95 }, { ...base, condition: "open_box" }, now)).toBeNull();
    expect(getAlertObservation({ ...item, target_price: 95, condition: "unknown" }, base, now)).toBeNull();
    expect(isBackInStockAlert({ ...item, alert_on_back_in_stock: true }, { ...base, condition: "refurbished", availability: "in_stock" }, "out_of_stock", now)).toBe(false);
  });

  it("requires an explicit alert preference and supports percentage drops", () => {
    expect(getAlertObservation(item, base, now)).toBeNull();
    expect(getAlertObservation({ ...item, price_drop_percent: 10 }, base, now)?.percentage).toBe(true);
    expect(getAlertObservation({ ...item, price_drop_percent: 15 }, base, now)).toBeNull();
  });

  it("alerts once for newly discovered cheaper offers and supported restocks", () => {
    const newOffer = { ...base, created_at: new Date(now - 60_000).toISOString() };
    expect(getAlertObservation({ ...item, alert_on_new_cheaper_offer: true }, newOffer, now)?.newCheaper).toBe(true);
    expect(isBackInStockAlert({ ...item, alert_on_back_in_stock: true }, { ...base, availability: "in_stock" }, "out_of_stock", now)).toBe(true);
    expect(isBackInStockAlert({ ...item, alert_on_back_in_stock: true }, { ...base, availability: "in_stock" }, "in_stock", now)).toBe(false);
    expect(isBackInStockAlert({ ...item, alert_on_back_in_stock: true }, { ...base, availability: "unknown" }, "out_of_stock", now)).toBe(false);
  });

  it("labels web search snippet alerts honestly", () => {
    expect(getAlertSourceLabel("openrouter_web_search")).toBe("Web search snippet");
    expect(getAlertSourceLabel("google_shopping")).toBe("Google Shopping");
  });
});
