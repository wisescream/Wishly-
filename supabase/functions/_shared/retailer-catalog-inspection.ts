import { fetchPinnedProductPage, type PinnedFetchTransport } from "./pinned-fetch.ts";
import { inspectRetailerProductPage } from "./retailer-discovery.ts";
import { getRetailerDomain, retailerPageRobotsDecision } from "./retailer-discovery.ts";
import type { DnsResolver } from "./url-security.ts";

export type RetailerCatalogStatus = "validated" | "restricted" | "temporarily_unavailable" | "discovered" | "rejected";

export interface RetailerCatalogInspection {
  status: RetailerCatalogStatus;
  errorCode: string | null;
  pageUrl: string | null;
  httpStatus: number | null;
  evidence: { title?: string; hasPrice: boolean; currency?: string; hasImage: boolean };
}

const PRODUCT_PATH = /(?:^|\/)(?:products?|product-details?|item|items|p|goods|dp)(?:\/|[-_0-9])/i;

export function parseSitemapLocations(xml: string, baseUrl: string): string[] {
  let base: URL;
  try { base = new URL(baseUrl); }
  catch { return []; }
  const domain = getRetailerDomain(base.href);
  if (!domain) return [];
  const seen = new Set<string>();
  return [...xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc\s*>/gi)].flatMap((match) => {
    const raw = match[1].trim().replace(/&amp;/gi, "&").replace(/&quot;/gi, "\"").replace(/&#39;/gi, "'");
    try {
      const url = new URL(raw, base);
      const candidateDomain = getRetailerDomain(url.href);
      if (!candidateDomain || candidateDomain !== domain || seen.has(url.href)) return [];
      seen.add(url.href);
      return [url.href];
    } catch { return []; }
  }).slice(0, 200);
}

export function chooseSitemapProductPages(locations: string[], limit = 4, isProductSitemap = false): string[] {
  const max = Number.isFinite(limit) ? Math.max(0, Math.min(8, Math.floor(limit))) : 0;
  if (!max) return [];
  const seen = new Set<string>();
  return locations.flatMap((location) => {
    try {
      if ((!isProductSitemap && !PRODUCT_PATH.test(new URL(location).pathname)) || seen.has(location)) return [];
      seen.add(location);
      return [location];
    } catch { return []; }
  }).slice(0, max);
}

export function retailerCatalogEvidenceIsSufficient(evidence: RetailerCatalogInspection["evidence"]): boolean {
  return Boolean(evidence.title?.trim() && evidence.hasPrice && evidence.currency && evidence.hasImage);
}

function sitemapLinksFromRobots(robots: string): string[] {
  return robots.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
    return match ? [match[1]] : [];
  }).slice(0, 3);
}

export function isProductSitemapUrl(url: string): boolean {
  try { return /(?:^|\/)(?:sitemap[_-])?(?:products?|catalog)(?:[_./-]|$)/i.test(new URL(url).pathname); }
  catch { return false; }
}

async function fetchSmallText(
  url: string,
  resolveDns: DnsResolver,
  transport: PinnedFetchTransport,
  maxBodyBytes: number,
): Promise<{ status: number | null; finalUrl: URL; text: string; errorCode?: string } | null> {
  let redirectRobotsAccess: "allowed" | "restricted" | "temporarily_unavailable" = "allowed";
  try {
    const response = await fetchPinnedProductPage(url, resolveDns, transport, {
      maxBodyBytes,
      timeoutMs: 6_000,
      maxRedirects: 2,
      onRedirect: async (target) => {
        redirectRobotsAccess = await retailerPageRobotsDecision(target.href, resolveDns, transport);
        return redirectRobotsAccess === "allowed";
      },
    });
    if (response.truncated) return null;
    if (response.status < 200 || response.status >= 300) return { status: response.status, finalUrl: response.finalUrl, text: "" };
    return { status: response.status, finalUrl: response.finalUrl, text: new TextDecoder().decode(response.body) };
  } catch {
    if (redirectRobotsAccess !== "allowed") {
      return { status: null, finalUrl: new URL(url), text: "", errorCode: redirectRobotsAccess === "restricted" ? "robots_restricted" : "robots_unavailable" };
    }
    return null;
  }
}

/**
 * Validate one discovered retailer per scheduled tick by checking robots.txt,
 * a public sitemap, and one or more accessible product pages. A domain is only
 * validated when a product page exposes a title, price, currency, and image.
 */
export async function inspectRetailerCatalog(
  rawDomain: string,
  resolveDns: DnsResolver,
  transport: PinnedFetchTransport,
): Promise<RetailerCatalogInspection> {
  const domain = getRetailerDomain(`https://${rawDomain}`);
  const empty = { hasPrice: false, hasImage: false };
  if (!domain) return { status: "rejected", errorCode: "invalid_domain", pageUrl: null, httpStatus: null, evidence: empty };

  const base = `https://${domain}`;
  const robotsUrl = `${base}/robots.txt`;
  const robotsPage = await fetchSmallText(robotsUrl, resolveDns, transport, 128 * 1024);
  if (!robotsPage) return { status: "temporarily_unavailable", errorCode: "robots_unavailable", pageUrl: robotsUrl, httpStatus: null, evidence: empty };
  if (robotsPage.errorCode) return {
    status: robotsPage.errorCode === "robots_restricted" ? "restricted" : "temporarily_unavailable",
    errorCode: robotsPage.errorCode, pageUrl: robotsUrl, httpStatus: null, evidence: empty,
  };
  if (robotsPage.status === 401 || robotsPage.status === 403) return { status: "restricted", errorCode: `robots_http_${robotsPage.status}`, pageUrl: robotsUrl, httpStatus: robotsPage.status, evidence: empty };
  if (robotsPage.status === 429 || robotsPage.status >= 500) return { status: "temporarily_unavailable", errorCode: `robots_http_${robotsPage.status}`, pageUrl: robotsUrl, httpStatus: robotsPage.status, evidence: empty };
  if (robotsPage.status >= 400 && robotsPage.status !== 404 && robotsPage.status !== 410) return { status: "temporarily_unavailable", errorCode: `robots_http_${robotsPage.status}`, pageUrl: robotsUrl, httpStatus: robotsPage.status, evidence: empty };

  const robotsSitemaps = sitemapLinksFromRobots(robotsPage.text);
  const sitemapCandidates = [...new Set([...robotsSitemaps, `${base}/sitemap.xml`])]
    .filter((candidate) => getRetailerDomain(candidate) === domain).slice(0, 3);
  let productPages: string[] = [];
  let sitemapError = "sitemap_not_found";
  let sitemapStatus: number | null = robotsPage.status;
  for (const sitemapUrl of sitemapCandidates) {
    const sitemapRobots = await retailerPageRobotsDecision(sitemapUrl, resolveDns, transport);
    if (sitemapRobots !== "allowed") {
      sitemapError = sitemapRobots === "restricted" ? "robots_restricted" : "robots_unavailable";
      continue;
    }
    const sitemap = await fetchSmallText(sitemapUrl, resolveDns, transport, 1024 * 1024);
    if (!sitemap) { sitemapError = "sitemap_unavailable"; continue; }
    if (sitemap.errorCode) { sitemapError = sitemap.errorCode; continue; }
    sitemapStatus = sitemap.status;
    if (sitemap.status === 401 || sitemap.status === 403) { sitemapError = "robots_restricted"; continue; }
    if (sitemap.status === 429 || sitemap.status >= 500) { sitemapError = `sitemap_http_${sitemap.status}`; continue; }
    if (getRetailerDomain(sitemap.finalUrl.href) !== domain) { sitemapError = "cross_domain_sitemap_redirect"; continue; }
    const locations = parseSitemapLocations(sitemap.text, sitemap.finalUrl.href);
    productPages = chooseSitemapProductPages(locations, 4, isProductSitemapUrl(sitemap.finalUrl.href));
    if (!productPages.length && /<sitemapindex\b/i.test(sitemap.text)) {
      const childSitemaps = locations.filter((location) => /product|catalog|sitemap/i.test(new URL(location).pathname)).slice(0, 2);
      for (const child of childSitemaps) {
        const childRobots = await retailerPageRobotsDecision(child, resolveDns, transport);
        if (childRobots !== "allowed") {
          sitemapError = childRobots === "restricted" ? "robots_restricted" : "robots_unavailable";
          continue;
        }
        const childResponse = await fetchSmallText(child, resolveDns, transport, 1024 * 1024);
        if (!childResponse) continue;
        if (childResponse.errorCode) { sitemapError = childResponse.errorCode; continue; }
        if (childResponse.status === 401 || childResponse.status === 403) { sitemapError = "robots_restricted"; continue; }
        if (childResponse.status === 429 || childResponse.status >= 500) { sitemapError = `sitemap_http_${childResponse.status}`; continue; }
        if (getRetailerDomain(childResponse.finalUrl.href) !== domain) { sitemapError = "cross_domain_sitemap_redirect"; continue; }
        productPages = chooseSitemapProductPages(
          parseSitemapLocations(childResponse.text, childResponse.finalUrl.href), 4, isProductSitemapUrl(childResponse.finalUrl.href),
        );
        if (productPages.length) break;
      }
    }
    if (productPages.length) break;
    sitemapError = "product_pages_not_found";
  }

  if (!productPages.length) {
    const restricted = sitemapError === "robots_restricted";
    const temporarilyUnavailable = sitemapError === "sitemap_unavailable" || sitemapError === "robots_unavailable" || /^sitemap_http_(?:429|5\d\d)$/.test(sitemapError);
    return {
      status: restricted ? "restricted" : temporarilyUnavailable ? "temporarily_unavailable" : "discovered",
      errorCode: sitemapError,
      pageUrl: sitemapCandidates[0] || robotsUrl,
      httpStatus: sitemapStatus,
      evidence: empty,
    };
  }

  let lastError = "product_metadata_missing";
  let lastEvidence = empty;
  let lastPage: string | null = null;
  let lastStatus: number | null = null;
  for (const pageUrl of productPages.slice(0, 2)) {
    const inspection = await inspectRetailerProductPage(pageUrl, resolveDns, transport);
    lastPage = inspection.finalUrl;
    lastStatus = inspection.status;
    lastError = inspection.errorCode || lastError;
    const metadata = inspection.metadata;
    if (inspection.errorCode === "cross_domain_product_redirect") {
      lastError = inspection.errorCode;
      continue;
    }
    if (!metadata) continue;
    const evidence = {
      ...(metadata.title ? { title: metadata.title.slice(0, 300) } : {}),
      hasPrice: metadata.price != null && metadata.price > 0 && !metadata.price_conflict,
      ...(metadata.currency ? { currency: metadata.currency } : {}),
      hasImage: Boolean(metadata.image_url),
    };
    lastEvidence = evidence;
    if (getRetailerDomain(inspection.finalUrl) !== domain) {
      lastError = "cross_domain_product_redirect";
      continue;
    }
    if (retailerCatalogEvidenceIsSufficient(evidence)) {
      return { status: "validated", errorCode: null, pageUrl: inspection.finalUrl, httpStatus: inspection.status, evidence };
    }
  }

  if (lastError === "robots_restricted" || lastStatus === 401 || lastStatus === 403) {
    return { status: "restricted", errorCode: lastError, pageUrl: lastPage, httpStatus: lastStatus, evidence: lastEvidence };
  }
  if (lastError === "robots_unavailable" || lastError === "fetch_failed" || lastError === "fetch_unknown" || lastError === "response_truncated" || lastStatus === 429 || (lastStatus != null && lastStatus >= 500)) {
    return { status: "temporarily_unavailable", errorCode: lastError, pageUrl: lastPage, httpStatus: lastStatus, evidence: lastEvidence };
  }
  return { status: "discovered", errorCode: lastError, pageUrl: lastPage, httpStatus: lastStatus, evidence: lastEvidence };
}
