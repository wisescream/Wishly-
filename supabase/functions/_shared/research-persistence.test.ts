import { afterEach, describe, expect, it, vi } from "vitest";
import { deferPersistenceRetry, recordOfferPriceObservations } from "./research-persistence.ts";

afterEach(() => vi.restoreAllMocks());

describe("research result persistence", () => {
  it("records valid offer observations and reports rejected or failed writes", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const admin = {
      async rpc(_name: string, args: Record<string, unknown>) {
        calls.push(args);
        if (args.p_offer_id === "bad") return { data: null, error: { code: "db_write_failed" } };
        return { data: "observation-id", error: null };
      },
    };
    const result = await recordOfferPriceObservations(admin, "item-1", [
      { id: "good", price: 12, currency: "EUR", store: "Shop", last_verified_at: "2026-01-01T00:00:00.000Z" },
      { id: "bad", price: 9, currency: "USD", url: "https://shop.example/item" },
      { id: "invalid", price: 0, currency: "USD" },
    ], "2026-01-02T00:00:00.000Z");

    expect(result).toEqual({ attempted: 2, failed: 1, errorCode: "db_write_failed" });
    expect(calls[0]).toMatchObject({ p_item_id: "item-1", p_offer_id: "good", p_currency: "EUR", p_recorded_at: "2026-01-01T00:00:00.000Z" });
    expect(calls[1].p_recorded_at).toBe("2026-01-02T00:00:00.000Z");
  });

  it("turns thrown history writes into retryable failures", async () => {
    const result = await recordOfferPriceObservations({ async rpc() { throw new Error("private database detail"); } }, "item-1", [
      { id: "offer-1", price: 10, currency: "USD" },
    ], "2026-01-02T00:00:00.000Z");
    expect(result).toEqual({ attempted: 1, failed: 1, errorCode: null });
  });

  it("sets a backoff retry and logs only the database error code", async () => {
    const update = vi.fn(async () => ({ error: null }));
    const eq = vi.fn(async () => ({ error: null }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const admin = { from: () => ({ update: (values: Record<string, unknown>) => {
      update(values);
      return { eq };
    } }) };
    const before = Date.now();
    const result = await deferPersistenceRetry(admin, { id: "item-1", offer_search_attempts: 1 }, "2026-01-02T00:00:00.000Z", "price_history");

    expect(result.scheduled).toBe(true);
    expect(result.attempts).toBe(2);
    expect(Date.parse(result.retryAt)).toBeGreaterThan(before);
    expect(eq).toHaveBeenCalledWith("id", "item-1");
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).not.toContain("private");
  });

  it("reports when the retry scheduler itself throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const admin = { from: () => ({ update: () => ({ eq: async () => { throw new Error("private database detail"); } }) }) };
    const result = await deferPersistenceRetry(admin, { id: "item-1" }, "2026-01-02T00:00:00.000Z", "offer_upsert");

    expect(result.scheduled).toBe(false);
    expect(result.errorCode).toBe("retry_schedule_exception");
    expect(log.mock.calls[0][0]).not.toContain("private");
  });
});
