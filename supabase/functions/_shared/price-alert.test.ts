import { describe, expect, it } from "vitest";
import { getAlertDeduplicationKey, getAlertObservation } from "./price-alert";

const now = Date.parse("2026-10-11T12:00:00.000Z");
const base = { id: "offer-1", price: 90, total_price: null, currency: "MAD", condition: "unknown", availability: "unknown", last_verified_at: new Date(now).toISOString(), total_is_estimated: true };

describe("price alert observations", () => {
  it("alerts on a fresh same-currency lower listing while labeling incomplete totals", () => {
    const observation = getAlertObservation({ current_price: 100, target_price: null, currency: "MAD" }, base, now);
    expect(observation).toMatchObject({ price: 90, completeTotal: false, target: false, reason: "lower-than-original" });
  });

  it("uses a complete total for target alerts and blocks mismatched currency or stale offers", () => {
    const complete = { ...base, total_price: 70, total_is_estimated: false };
    expect(getAlertObservation({ current_price: 100, target_price: 75, currency: "MAD" }, complete, now)?.completeTotal).toBe(true);
    expect(getAlertObservation({ current_price: 100, target_price: 75, currency: "EUR" }, complete, now)).toBeNull();
    expect(getAlertObservation({ current_price: 100, target_price: 75, currency: "MAD" }, { ...complete, last_verified_at: new Date(now - 25 * 60 * 60 * 1000).toISOString() }, now)).toBeNull();
  });

  it("deduplicates unchanged observations by price and event reason", () => {
    const observation = getAlertObservation({ current_price: 100, target_price: 95, currency: "MAD" }, base, now)!;
    expect(getAlertDeduplicationKey("item-1", base, observation)).toBe(getAlertDeduplicationKey("item-1", base, observation));
    expect(getAlertDeduplicationKey("item-1", base, observation)).not.toBe(getAlertDeduplicationKey("item-1", { ...base, price: 89 }, { ...observation, price: 89 }));
  });
});
