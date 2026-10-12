import { describe, expect, it } from "vitest";
import { parseEstimatedUnitCost, parseOpenRouterWebSearchCount, recordProviderMetric } from "./provider-metrics.ts";

describe("provider search metrics", () => {
  it("accepts only bounded non-negative configured cost estimates", () => {
    expect(parseEstimatedUnitCost("0.0035")).toBe(0.0035);
    expect(parseEstimatedUnitCost("0")).toBe(0);
    expect(parseEstimatedUnitCost(undefined)).toBeNull();
    expect(parseEstimatedUnitCost("-1")).toBeNull();
    expect(parseEstimatedUnitCost("nope")).toBeNull();
    expect(parseEstimatedUnitCost("1001")).toBeNull();
  });

  it("stores no query, user, or estimated charge for a budget rejection", async () => {
    let inserted: Record<string, unknown> | null = null;
    const client = { from: (table: string) => ({ insert: async (row: Record<string, unknown>) => { expect(table).toBe("provider_search_metrics"); inserted = row; return { error: null }; } }) };
    await recordProviderMetric(client, { provider: "serpapi", surface: "interactive", outcome: "budget_exhausted", unitCostUsd: 0.01 });
    expect(inserted).toMatchObject({ request_count: 0, search_count: 0, estimated_cost_usd: null, result_count: 0, duration_ms: 0 });
    expect(inserted).not.toHaveProperty("query");
    expect(inserted).not.toHaveProperty("user_id");
  });

  it("uses actual OpenRouter search calls for cost estimates", async () => {
    expect(parseOpenRouterWebSearchCount({ web_search_requests: 2 })).toBe(2);
    expect(parseOpenRouterWebSearchCount({ web_search_requests: 0 })).toBe(0);
    expect(parseOpenRouterWebSearchCount({ web_search_requests: "2" })).toBeNull();
    let inserted: Record<string, unknown> | null = null;
    const client = { from: () => ({ insert: async (row: Record<string, unknown>) => { inserted = row; return { error: null }; } }) };
    await recordProviderMetric(client, { provider: "openrouter", surface: "interactive", outcome: "success", unitCostUsd: 0.007, searchCount: 2 });
    expect(inserted).toMatchObject({ request_count: 1, search_count: 2, estimated_cost_usd: 0.014 });
  });
});
