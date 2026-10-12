export type ProviderName = "serpapi" | "openrouter";
export type ProviderSurface = "interactive" | "scheduled";
export type ProviderOutcome = "success" | "error" | "budget_exhausted";

export function parseEstimatedUnitCost(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= 1000
    ? Math.round(amount * 1_000_000) / 1_000_000
    : null;
}

export function parseOpenRouterWebSearchCount(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const count = (value as Record<string, unknown>).web_search_requests;
  return typeof count === "number" && Number.isInteger(count) && count >= 0 && count <= 100 ? count : null;
}

interface ProviderMetric {
  provider: ProviderName;
  surface: ProviderSurface;
  outcome: ProviderOutcome;
  durationMs?: number;
  resultCount?: number;
  searchCount?: number | null;
  statusCode?: number | null;
  unitCostUsd?: number | null;
  marketCountry?: string | null;
}

export async function recordProviderMetric(client: any, metric: ProviderMetric): Promise<void> {
  const requestCount = metric.outcome === "budget_exhausted" ? 0 : 1;
  const searchCount = requestCount === 0 ? 0 : metric.searchCount ?? (metric.provider === "serpapi" ? 1 : null);
  const estimatedCost = requestCount === 0 || searchCount == null || metric.unitCostUsd == null
    ? null
    : Math.round(searchCount * metric.unitCostUsd * 1_000_000) / 1_000_000;
  const row = {
    provider: metric.provider,
    surface: metric.surface,
    outcome: metric.outcome,
    request_count: requestCount,
    search_count: searchCount,
    result_count: Math.max(0, Math.trunc(metric.resultCount || 0)),
    duration_ms: Math.max(0, Math.trunc(metric.durationMs || 0)),
    status_code: metric.statusCode || null,
    estimated_cost_usd: estimatedCost,
    market_country: metric.marketCountry && /^[A-Z]{2}$/.test(metric.marketCountry) ? metric.marketCountry : null,
  };

  try {
    const { error } = await client.from("provider_search_metrics").insert(row);
    if (error) console.error(JSON.stringify({ event: "provider_metric_write_failed", provider: metric.provider, surface: metric.surface }));
  } catch {
    // Observability must not prevent product research from completing.
    console.error(JSON.stringify({ event: "provider_metric_write_failed", provider: metric.provider, surface: metric.surface }));
  }
}
