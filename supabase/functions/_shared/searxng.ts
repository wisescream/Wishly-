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
): Promise<{ response: Response; results: SearXNGResult[] }> {
  const url = buildSearXNGSearchUrl(baseUrl, query, language);
  if (!url) throw new Error("SearXNG must be configured with a valid HTTPS base URL.");
  const response = await fetcher(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return { response, results: [] };
  let payload: unknown;
  try { payload = await response.json(); }
  catch { return { response, results: [] }; }
  return { response, results: parseSearXNGResponse(payload) };
}
