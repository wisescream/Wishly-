export interface SerpApiShoppingResponse {
  rows: unknown[];
  error: string | null;
}

/** Parse a successful HTTP body without confusing SerpApi-level errors with no results. */
export function parseSerpApiShoppingResponse(payload: unknown): SerpApiShoppingResponse {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { rows: [], error: "invalid_response" };
  }

  const response = payload as Record<string, unknown>;
  if (typeof response.error === "string" && response.error.trim()) {
    return { rows: [], error: "provider_error" };
  }

  return {
    rows: Array.isArray(response.shopping_results) ? response.shopping_results : [],
    error: null,
  };
}
