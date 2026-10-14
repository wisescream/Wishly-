import { isRetailerUrl } from "./web-search.ts";

export interface SearXNGResult {
  title: string;
  url: string;
  content: string;
  score: number | null;
  imageUrl: string | null;
}

export interface SearXNGCandidate {
  title: string;
  brand: null;
  image_url: string | null;
  price: null;
  currency: undefined;
  store: string;
  url: string;
  confidence: number;
  match_reason: string;
  source: "searxng_web_search";
}

const cooldownUntil = new Map<string, number>();
const MAX_RETRY_AFTER_MS = 15 * 60_000;
const PERSISTED_COOLDOWN_MS = 15 * 60_000;
const COOLDOWN_MARKER = "_wishly_searxng_cooldown";

/** Cache key shared across edge-function isolates for a SearXNG host cooldown. */
export async function searXNGCooldownCacheKey(baseUrl: string): Promise<string | null> {
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`searxng|cooldown|${parsed.hostname.toLowerCase()}`));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch { return null; }
}

export function isSearXNGCooldownCache(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && (value as Record<string, unknown>)[COOLDOWN_MARKER] === true);
}

export function searXNGCooldownCacheValue() {
  return { [COOLDOWN_MARKER]: true, error_code: "rate_limited" };
}

export const searXNGPersistedCooldownMs = PERSISTED_COOLDOWN_MS;

export interface SearXNGRetryOptions {
  now?: () => number;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

export function classifySearXNGFailure(status: number): "rate_limited" | "provider_unavailable" | "provider_error" {
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "provider_error";
}

function retryAfterMs(response: Response, now: number, random: () => number): number {
  const header = response.headers.get("retry-after")?.trim();
  if (header) {
    const seconds = Number(header);
    const requested = Number.isFinite(seconds)
      ? seconds * 1000
      : Date.parse(header) - now;
    if (Number.isFinite(requested) && requested > 0) {
      return Math.min(MAX_RETRY_AFTER_MS, requested);
    }
  }
  // Back off for a meaningful interval, with jitter, before the single retry.
  return 1_000 + Math.floor(Math.max(0, Math.min(0.999999, random())) * 2_000);
}

export function parseSearXNGResponse(value: unknown): SearXNGResult[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const rows = (value as Record<string, unknown>).results;
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  return rows.flatMap((row): SearXNGResult[] => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const result = row as Record<string, unknown>;
    const title = typeof result.title === "string" ? result.title.trim().slice(0, 300) : "";
    const url = typeof result.url === "string" ? result.url.trim() : "";
    if (!title || !isRetailerUrl(url) || seen.has(url)) return [];
    seen.add(url);
    const score = Number(result.score);
    const imageCandidate = result.thumbnail ?? result.imageUrl;
    const imageUrl = typeof imageCandidate === "string" && /^https:\/\//i.test(imageCandidate)
      ? imageCandidate.slice(0, 2000)
      : null;
    return [{
      title,
      url,
      content: typeof result.content === "string" ? result.content.slice(0, 3000) : "",
      score: Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : null,
      imageUrl,
    }];
  }).slice(0, 20);
}

export function toSearXNGCandidates(results: SearXNGResult[]): SearXNGCandidate[] {
  return results.map((result) => ({
    title: result.title,
    brand: null,
    image_url: result.imageUrl,
    price: null,
    currency: undefined,
    store: new URL(result.url).hostname.replace(/^www\./, ""),
    url: result.url,
    confidence: 0.25,
    match_reason: "Unverified public web-search lead. Wishly has not inspected this product page or confirmed its price.",
    source: "searxng_web_search",
  }));
}

export function buildSearXNGSearchUrl(baseUrl: string, query: string, language = "en"): URL | null {
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) return null;
    const search = new URL("/search", base.origin);
    search.searchParams.set("q", query.slice(0, 240));
    search.searchParams.set("format", "json");
    search.searchParams.set("categories", "general");
    search.searchParams.set("safesearch", "1");
    if (/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language)) search.searchParams.set("language", language);
    return search;
  } catch { return null; }
}

export async function searchSearXNG(
  baseUrl: string,
  query: string,
  language = "en",
  fetcher: typeof fetch = fetch,
  retryOptions: SearXNGRetryOptions = {},
): Promise<{ response: Response; results: SearXNGResult[] }> {
  const url = buildSearXNGSearchUrl(baseUrl, query, language);
  if (!url) throw new Error("SearXNG must be configured with a valid HTTPS base URL.");
  const now = retryOptions.now || Date.now;
  const host = url.hostname.toLowerCase();
  if ((cooldownUntil.get(host) || 0) > now()) {
    return { response: new Response(null, { status: 429, statusText: "SearXNG cooldown" }), results: [] };
  }
  const sleep = retryOptions.sleep || ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const random = retryOptions.random || Math.random;
  const timeoutMs = retryOptions.timeoutMs || 8_000;
  let response = await fetcher(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
  // Retry only a 429, once, with bounded jitter. A second 429 cools the host down.
  if (response.status === 429) {
    const delay = retryAfterMs(response, now(), random);
    // Suppress concurrent refreshes while this one bounded retry is pending.
    cooldownUntil.set(host, now() + Math.min(MAX_RETRY_AFTER_MS, Math.max(60_000, delay)));
    await sleep(delay);
    response = await fetcher(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
    if (response.status === 429) {
      const secondDelay = retryAfterMs(response, now(), random);
      cooldownUntil.set(host, now() + Math.min(MAX_RETRY_AFTER_MS, Math.max(60_000, secondDelay)));
    }
    else cooldownUntil.delete(host);
  } else if (response.ok) cooldownUntil.delete(host);
  if (!response.ok) return { response, results: [] };
  let payload: unknown;
  try { payload = await response.json(); }
  catch { return { response, results: [] }; }
  return { response, results: parseSearXNGResponse(payload) };
}
