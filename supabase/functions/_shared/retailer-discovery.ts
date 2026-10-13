import { fetchPinnedProductPage, type PinnedFetchTransport } from "./pinned-fetch.ts";
import { parseProductMetadata } from "./product-metadata.ts";
import { isPrivateOrReservedIpv4, validateProductFetchUrl, type DnsResolver } from "./url-security.ts";

export type RetailerSellerType = "official" | "marketplace" | "independent" | "reseller" | "outlet" | "second_hand" | "unknown";
export type ProductOfferEvidenceError = "product_identity_not_confirmed" | "product_price_or_currency_missing";

export function productOfferEvidenceError(
  identityConfirmed: boolean,
  price: unknown,
  currency: string | null | undefined,
): ProductOfferEvidenceError | null {
  if (!identityConfirmed) return "product_identity_not_confirmed";
  const amount = typeof price === "number" ? price : Number(price);
  if (!Number.isFinite(amount) || amount <= 0 || !currency || !/^[A-Z]{3}$/.test(currency)) {
    return "product_price_or_currency_missing";
  }
  return null;
}

export function getRetailerDomain(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.hostname.includes(":")) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "localhost" || host.endsWith(".localhost") || isPrivateOrReservedIpv4(host)) return null;
    if (!host.includes(".") || host.length > 253) return null;
    return host;
  } catch { return null; }
}

export function selectRetailerInspectionTargets<T extends {
  url?: string | null;
  source?: string | null;
  product_match_confidence?: number | null;
}>(offers: T[], limit: number): T[] {
  const max = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  if (!max) return [];
  const seen = new Set<string>();
  return offers
    .filter((offer) => offer.source === "google_shopping" && Number(offer.product_match_confidence) >= 0.9 && typeof offer.url === "string")
    .sort((left, right) => Number(right.product_match_confidence) - Number(left.product_match_confidence))
    .filter((offer) => {
      const domain = getRetailerDomain(offer.url!);
      if (!domain || seen.has(domain)) return false;
      seen.add(domain);
      return true;
    })
    .slice(0, max);
}

export function safeCanonicalProductUrl(candidate: string | null | undefined, pageUrl: string): string {
  const pageDomain = getRetailerDomain(pageUrl);
  const candidateDomain = candidate ? getRetailerDomain(candidate) : null;
  if (!candidate || !pageDomain || candidateDomain !== pageDomain) return pageUrl;
  try {
    const canonical = new URL(candidate);
    const page = new URL(pageUrl);
    if (page.protocol === "https:" && canonical.protocol !== "https:") return pageUrl;
    return canonical.href;
  } catch { return pageUrl; }
}

export function inferRetailerCountry(domain: string): string {
  const host = domain.toLowerCase();
  if (host.endsWith(".ma")) return "MA";
  if (host.endsWith(".fr")) return "FR";
  if (host.endsWith(".es")) return "ES";
  if (host.endsWith(".pt")) return "PT";
  if (host.endsWith(".de")) return "DE";
  if (host.endsWith(".it")) return "IT";
  if (host.endsWith(".co.uk") || host.endsWith(".uk")) return "GB";
  if (host.endsWith(".tr")) return "TR";
  if (host.endsWith(".ca")) return "CA";
  if (host.endsWith(".au")) return "AU";
  return "GLOBAL";
}

export function classifySeller(domain: string): RetailerSellerType {
  const host = domain.toLowerCase().replace(/^www\./, "");
  if (/(?:^|\.)(?:vinted|avito|ebay|depop|grailed|poshmark|mercari|vestiaire|stockx|goat|wallapop|kleinanzeigen|marketplace|etsy|amazon|walmart|jumia|marjanemall|cdiscount|rakuten|trendyol|hepsiburada|aliexpress|temu|taobao|tmall|jd|qoo10|pazarama)\.[a-z]{2,}(?:\.[a-z]{2,})?$/i.test(host)) return "marketplace";
  if (/outlet|veepee|privalia|showroomprive|bestsecret|yoox|theoutnet|mandmdirect|tkmaxx/.test(host)) return "outlet";
  if (/thredup|therealreal|sellpy|secondhand/.test(host)) return "second_hand";
  return "unknown";
}

export function robotsTxtAllowsPath(robots: string, pathname: string, userAgent = "WishlyBot"): boolean {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let group: { agents: string[]; rules: Array<{ allow: boolean; path: string }> } | null = null;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.split("#", 1)[0].trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "user-agent") {
      if (!group || group.rules.length) { group = { agents: [], rules: [] }; groups.push(group); }
      group.agents.push(value.toLowerCase());
    } else if (group && (key === "allow" || key === "disallow") && value) {
      group.rules.push({ allow: key === "allow", path: value });
    }
  }
  const agent = userAgent.toLowerCase();
  const specific = groups.filter((item) => item.agents.some((candidate) => candidate !== "*" && agent.includes(candidate)));
  const applicable = specific.length ? specific : groups.filter((item) => item.agents.includes("*"));
  const pathMatches = (pattern: string, value: string) => {
    const anchored = pattern.endsWith("$");
    const path = anchored ? pattern.slice(0, -1) : pattern;
    const expression = path.split("*").map((part) => part.replace(/[\\^$+?.()|[\]{}]/g, "\\$&")).join(".*");
    return new RegExp(`^${expression}${anchored ? "$" : ""}`).test(value);
  };
  const rules = applicable.flatMap((item) => item.rules)
    .filter((rule) => pathMatches(rule.path, pathname))
    .sort((a, b) => b.path.replace(/\*/g, "").length - a.path.replace(/\*/g, "").length || Number(b.allow) - Number(a.allow));
  return rules[0]?.allow ?? true;
}

type Inspection = {
  permitted: boolean;
  status: number | null;
  finalUrl: string;
  canonicalDomain: string | null;
  metadata: ReturnType<typeof parseProductMetadata> | null;
  errorCode: string | null;
};

const robotsCache = new Map<string, { at: number; body: string | null; denied: boolean }>();
async function pinnedGet(url: string, resolveDns: DnsResolver, transport: PinnedFetchTransport, timeoutMs: number, maxBodyBytes: number, checkRedirectRobots = false) {
  return await fetchPinnedProductPage(url, resolveDns, transport, {
    timeoutMs, maxBodyBytes, maxRedirects: 3,
    ...(checkRedirectRobots ? { onRedirect: (target: URL) => robotsAllowed(target, resolveDns, transport) } : {}),
  });
}

async function robotsAllowed(url: URL, resolveDns: DnsResolver, transport: PinnedFetchTransport): Promise<boolean> {
  const host = url.hostname.toLowerCase();
  const cached = robotsCache.get(host);
  let rules = cached && Date.now() - cached.at < 6 * 60 * 60 * 1000 ? cached : null;
  if (!rules) {
    try {
      const response = await pinnedGet(`${url.origin}/robots.txt`, resolveDns, transport, 4000, 128 * 1024);
      if (response.status === 404 || response.status === 410) rules = { at: Date.now(), body: "", denied: false };
      else if (response.status >= 200 && response.status < 300 && !response.truncated) rules = { at: Date.now(), body: new TextDecoder().decode(response.body), denied: false };
      else rules = { at: Date.now(), body: null, denied: true };
    } catch { rules = { at: Date.now(), body: null, denied: true }; }
    robotsCache.set(host, rules);
  }
  return !rules.denied && robotsTxtAllowsPath(rules.body || "", `${url.pathname}${url.search}`);
}

export async function retailerPageRobotsAllowed(rawUrl: string, resolveDns: DnsResolver, transport: PinnedFetchTransport): Promise<boolean> {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return await robotsAllowed(url, resolveDns, transport);
  } catch { return false; }
}

export async function inspectRetailerProductPage(rawUrl: string, resolveDns: DnsResolver, transport: PinnedFetchTransport): Promise<Inspection> {
  const domain = getRetailerDomain(rawUrl);
  if (!domain) return { permitted: false, status: null, finalUrl: rawUrl, canonicalDomain: null, metadata: null, errorCode: "invalid_url" };
  let parsedUrl: URL;
  try { parsedUrl = new URL(rawUrl); } catch { return { permitted: false, status: null, finalUrl: rawUrl, canonicalDomain: domain, metadata: null, errorCode: "invalid_url" }; }
  if (!await robotsAllowed(parsedUrl, resolveDns, transport)) return { permitted: false, status: null, finalUrl: rawUrl, canonicalDomain: domain, metadata: null, errorCode: "robots_restricted" };
  const checked = await validateProductFetchUrl(rawUrl, resolveDns);
  if (!checked.safe || !checked.url) return { permitted: false, status: null, finalUrl: rawUrl, canonicalDomain: domain, metadata: null, errorCode: "unsafe_url" };
  try {
    const response = await pinnedGet(rawUrl, resolveDns, transport, 8000, 2 * 1024 * 1024, true);
    const finalDomain = getRetailerDomain(response.finalUrl.href);
    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    if (response.status < 200 || response.status >= 300) return { permitted: true, status: response.status, finalUrl: response.finalUrl.href, canonicalDomain: finalDomain, metadata: null, errorCode: `http_${response.status}` };
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) return { permitted: true, status: response.status, finalUrl: response.finalUrl.href, canonicalDomain: finalDomain, metadata: null, errorCode: "not_html" };
    const html = new TextDecoder().decode(response.body);
    const metadata = parseProductMetadata(html, response.finalUrl.href);
    metadata.canonical_url = safeCanonicalProductUrl(metadata.canonical_url, response.finalUrl.href);
    return { permitted: true, status: response.status, finalUrl: response.finalUrl.href, canonicalDomain: finalDomain, metadata, errorCode: metadata.title ? null : "product_metadata_missing" };
  } catch (error) {
    const errorCode = error instanceof Error && error.message.toLowerCase().includes("robots.txt") ? "robots_restricted" : error instanceof Error ? "fetch_failed" : "fetch_unknown";
    return { permitted: true, status: null, finalUrl: rawUrl, canonicalDomain: domain, metadata: null, errorCode };
  }
}
