export interface SerpApiShoppingResponse {
  rows: unknown[];
  error: string | null;
}

export type SerpApiErrorCode =
  | "missing_query"
  | "invalid_request"
  | "invalid_api_key"
  | "account_access"
  | "insufficient_credits"
  | "rate_limited"
  | "invalid_engine"
  | "provider_error"
  | "invalid_response"
  | "network_error"
  | "provider_unavailable"
  | "unknown";

export interface SerpApiShoppingRequest {
  url: URL;
  error: "missing_query" | "invalid_request" | null;
}

/** Build only documented Google Shopping parameters; reject malformed identity before spending quota. */
export function buildSerpApiShoppingRequest(input: {
  query: string;
  gl: string;
  hl: string;
  apiKey: string;
}): SerpApiShoppingRequest {
  const query = input.query.trim().replace(/\s+/g, " ");
  const gl = input.gl.trim().toLowerCase();
  const hl = input.hl.trim().toLowerCase();
  if (!query) return { url: new URL("https://serpapi.com/search.json"), error: "missing_query" };
  if (query.length > 240 || !/^[a-z]{2}$/.test(gl) || !/^[a-z]{2,3}(?:-[a-z]{2}|-\d{3})?$/.test(hl) || !input.apiKey.trim()) {
    return { url: new URL("https://serpapi.com/search.json"), error: "invalid_request" };
  }
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_shopping");
  url.searchParams.set("q", query);
  url.searchParams.set("gl", gl);
  url.searchParams.set("hl", hl);
  url.searchParams.set("api_key", input.apiKey);
  return { url, error: null };
}

function providerMessage(body: string): string {
  try {
    const payload: unknown = JSON.parse(body);
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const message = (payload as Record<string, unknown>).error;
      if (typeof message === "string") return message.slice(0, 500).toLowerCase();
    }
  } catch { /* A non-JSON provider response is classified by status. */ }
  return body.slice(0, 500).toLowerCase();
}

/** Classify provider failures without retaining its response body or credentials. */
export function classifySerpApiFailure(status: number, body = ""): SerpApiErrorCode {
  const message = providerMessage(body);
  if (/invalid api key|no valid api key/.test(message) || status === 401) return "invalid_api_key";
  if (/insufficient credits|out of searches|run out of searches|no searches remaining/.test(message) || status === 402) return "insufficient_credits";
  if (/rate limit|too many requests|hourly throughput/.test(message) || status === 429) return "rate_limited";
  if (/permission|account.*deleted|forbidden/.test(message) || status === 403) return "account_access";
  if (/invalid.*engine|unsupported.*engine|engine.*not supported/.test(message)) return "invalid_engine";
  if (/missing.*(?:query|\bq\b)|(?:query|\bq\b).*required/.test(message)) return "missing_query";
  if (status === 400) return "invalid_request";
  if (status >= 500 && status <= 599) return "provider_unavailable";
  if (status === 200 && body && message) return "provider_error";
  return "unknown";
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

/** Turn provider HTTP failures into actionable, credential-safe user messages. */
export function describeSerpApiHttpFailure(status: number, body = ""): string {
  const code = classifySerpApiFailure(status, body);
  if (code === "missing_query") return "SerpAPI rejected a search without a product query. Wishly will retry after rebuilding the query.";
  if (code === "invalid_request") return "Google Shopping rejected the search request parameters. Check the SerpAPI engine and query configuration.";
  if (code === "invalid_engine") return "SerpAPI rejected the Google Shopping engine configuration.";
  if (code === "invalid_api_key") return "SerpAPI rejected its API key. Check SERPAPI_KEY in Supabase Edge Function secrets.";
  if (code === "account_access") return "SerpAPI denied access to this account. Check the SerpAPI account and permissions.";
  if (code === "insufficient_credits") return "SerpAPI has no available searches or credits. Check the SerpAPI account plan.";
  if (code === "rate_limited") return "The SerpAPI request limit was reached. Wishly will retry later.";
  if (code === "provider_unavailable") return "SerpAPI is temporarily unavailable. Wishly will retry later.";
  return "Google Shopping is temporarily unavailable.";
}
