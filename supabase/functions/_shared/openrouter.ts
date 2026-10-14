export type OpenRouterErrorCode = "insufficient_credits" | "rate_limited" | "invalid_api_key" | "invalid_request" | "provider_unavailable" | "provider_error";

export async function requestOpenRouter(
  apiKey: string,
  body: unknown,
  fetcher: typeof fetch = fetch,
  timeoutMs = 20_000,
): Promise<Response> {
  return await fetcher("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/** Classify the response without retaining provider text that may contain sensitive details. */
export function classifyOpenRouterFailure(status: number, body = ""): OpenRouterErrorCode {
  let message = "";
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object") {
      const error = (parsed as Record<string, unknown>).error;
      if (typeof error === "string") message = error.toLowerCase();
      else if (error && typeof error === "object") {
        const item = error as Record<string, unknown>;
        message = `${String(item.code || "")} ${String(item.message || "")}`.toLowerCase();
      }
    }
  } catch { /* classify from HTTP status */ }
  if (status === 402 || /insufficient credit|no credit|billing|payment required/.test(message)) return "insufficient_credits";
  if (status === 429) return "rate_limited";
  if (status === 401 || /invalid api key|unauthorized/.test(message)) return "invalid_api_key";
  if (status === 400) return "invalid_request";
  if (status >= 500) return "provider_unavailable";
  return "provider_error";
}

export function describeOpenRouterFailure(code: OpenRouterErrorCode): string {
  if (code === "insufficient_credits") return "OpenRouter cannot run web search because the account needs billing or credits. Wishly will not retry this request.";
  if (code === "rate_limited") return "OpenRouter rate limit reached; Wishly will use another configured search source.";
  if (code === "invalid_api_key") return "OpenRouter rejected its API key; check OPENROUTER_API_KEY.";
  if (code === "invalid_request") return "OpenRouter rejected the web-search request parameters.";
  return "OpenRouter web search is temporarily unavailable; Wishly will use another configured search source.";
}
