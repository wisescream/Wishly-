import { isProductPriceCurrent, parseProductMetadata } from "./product-metadata.ts";
import { fetchPinnedProductPage, type PinnedFetchTransport } from "./pinned-fetch.ts";
import type { DnsResolver } from "./url-security.ts";
import { getTitleCoverage } from "./title-match.ts";
import { compareProductConditions, normalizeProductCondition } from "./product-condition.ts";
import { getRetailerDomain, retailerPageRobotsDecision } from "./retailer-discovery.ts";
import { confirmsGenderVariant, getGenderVariant } from "./gender-variant.ts";

export interface RetailerPageSeed {
  itemId: string;
  productId: string | null;
  variantId: string | null;
  title: string;
  brand: string | null;
  modelNumber: string | null;
  gtin: string | null;
  variantLabel: string | null;
  condition: string;
  currency: string;
}

export interface VerifiedRetailerOffer {
  item_id: string;
  product_id: string | null;
  variant_id: string | null;
  store: string;
  seller: string;
  listing_title: string;
  image_url: string | null;
  size_label: string | null;
  size_system: string | null;
  color_label: string | null;
  product_match_confidence: number;
  match_type: string;
  is_verified: true;
  price: number;
  currency: string;
  url: string;
  canonical_url: string | null;
  product_gtin: string | null;
  product_sku: string | null;
  product_model_number: string | null;
  gender_category: string | null;
  original_price: number | null;
  discount_percent: number | null;
  shipping_cost: number | null;
  taxes: number | null;
  total_price: null;
  shipping_known: false;
  taxes_known: false;
  total_is_estimated: true;
  condition: string;
  availability: string;
  source: "retailer_page";
  last_verified_at: string;
  verification_status: "verified" | "unavailable";
  verification_reason_code: string;
  verification_evidence: Record<string, unknown>;
}

export interface RetailerPageVerificationAttempt {
  offer: VerifiedRetailerOffer | null;
  finalUrl: string;
  status: number | null;
  errorCode: string | null;
  evidence: { title?: string; hasPrice: boolean; currency?: string; hasImage: boolean };
}

interface RetailerPageIdentityMatch {
  confidence: number;
  matchType: string;
}

function digits(value: string | null | undefined): string {
  return String(value || "").replace(/\D/g, "");
}

function normalize(value: string | null | undefined): string {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function withoutBrand(value: string | null | undefined, brand: string | null | undefined): string {
  const normalized = normalize(value);
  const normalizedBrand = normalize(brand);
  if (!normalizedBrand) return normalized;
  const brandPattern = normalizedBrand.replace(/\s+/g, "\\s+");
  return normalized.replace(new RegExp(`(^| )${brandPattern}($| )`, "g"), " ").replace(/\s+/g, " ").trim();
}

function hasExactModel(model: string, text: string): boolean {
  const escaped = model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\W)${escaped}($|\\W)`, "i").test(text);
}

const variantColors = [
  "natural titanium", "desert titanium", "space gray", "space grey", "rose gold", "starlight", "midnight",
  "burgundy", "purple", "orange", "yellow", "green", "silver", "white", "black", "graphite",
  "beige", "brown", "grey", "gray", "olive", "cream", "navy", "blue", "red", "pink", "gold", "tan", "teal",
];

function findColor(value: string): string | null {
  const lower = normalize(value);
  return variantColors.find((color) => new RegExp(`(^| )${color.replace(/\s+/g, " ")}($| )`).test(lower)) || null;
}

export function findProductVariantColor(value: string, brand?: string | null): string | null {
  return findColor(withoutBrand(value, brand));
}

function findCapacity(value: string): string | null {
  return value.match(/\b(\d+(?:\.\d+)?)\s*(MB|GB|TB)\b/i)?.slice(1).join("").toUpperCase() || null;
}

function findSize(value: string): { label: string; system: string | null } | null {
  const match = value.match(/\b(US\s*(?:men'?s|women'?s)|EU|UK|CM|MM)\s*[:#-]?\s*(XXS|XS|S|M|L|XL|XXL|\d{1,3}(?:\.\d)?)\b/i)
    || value.match(/\b(?:shoe\s+)?size\s*[:#-]?\s*(XXS|XS|S|M|L|XL|XXL|\d{1,3}(?:\.\d)?)\b/i)
    || value.trim().match(/^(XXS|XS|S|M|L|XL|XXL|\d{1,3}(?:\.\d)?)$/i);
  if (!match) return null;
  const hasSystem = /^(US|EU|UK|CM|MM)/i.test(match[0]);
  const system = hasSystem ? match[1].match(/^(US|EU|UK|CM|MM)/i)?.[1].toUpperCase() || null : null;
  return { label: (hasSystem ? match[2] : match[1]).toUpperCase(), system };
}

function removeStructuredVariantTokens(value: string): string {
  const color = findColor(value);
  let remaining = normalize(value);
  if (color) remaining = remaining.replace(new RegExp(`(^| )${color}($| )`), " ");
  remaining = remaining
    .replace(/\b\d+(?:\.\d+)?\s*(?:mb|gb|tb)\b/g, " ")
    .replace(/\b(?:us|eu|uk|cm|mm)\b/g, " ")
    .replace(/\b(?:xxs|xs|s|m|l|xl|xxl|\d{1,3}(?:\.\d)?)\b/g, " ")
    .replace(/\b(?:women|woman|men|man|female|male|unisex)\b/g, " ");
  return remaining.replace(/\s+/g, " ").trim();
}

function matchesRequestedVariant(seed: RetailerPageSeed, metadata: ReturnType<typeof parseProductMetadata>): boolean {
  const requested = String(seed.variantLabel || "").trim();
  const variantFields = [metadata.variant_name, metadata.variant_details.color, metadata.variant_details.size, metadata.variant_details.capacity, metadata.variant_details.sku].filter(Boolean).join(" ");
  const targetTitle = withoutBrand(seed.title, seed.brand);
  const candidateTitle = withoutBrand(metadata.title, metadata.brand);
  const evidence = [variantFields, candidateTitle, metadata.description].filter(Boolean).join(" ");
  const targetEvidence = [targetTitle, requested].filter(Boolean).join(" ");

  const targetColor = findColor(requested) || findColor(targetTitle);
  const candidateColor = findColor(metadata.variant_details.color || "")
    || findColor(metadata.variant_name || "")
    || findColor(candidateTitle);
  if (targetColor && candidateColor !== targetColor) return false;
  const targetCapacity = findCapacity(requested) || findCapacity(targetTitle);
  const candidateCapacity = findCapacity(metadata.variant_details.capacity || "")
    || findCapacity(metadata.variant_name || "")
    || findCapacity(candidateTitle);
  if (targetCapacity && candidateCapacity !== targetCapacity) return false;
  const targetGender = getGenderVariant(targetEvidence);
  const candidateGender = getGenderVariant([variantFields, candidateTitle].join(" "));
  if (!confirmsGenderVariant(targetGender, candidateGender)) return false;
  const targetSize = findSize(requested) || findSize(targetTitle);
  if (targetSize) {
    const candidateSize = findSize(metadata.variant_details.size || "")
      || findSize(metadata.variant_name || "")
      || findSize(candidateTitle);
    if (!candidateSize || targetSize.label !== candidateSize.label || (targetSize.system && targetSize.system !== candidateSize.system)) return false;
  }

  if (!requested) return true;
  if (!removeStructuredVariantTokens(requested)) return true;
  const requestedNormalized = normalize(requested);
  const evidenceNormalized = normalize(evidence);
  if (requestedNormalized && evidenceNormalized.includes(requestedNormalized)) return true;

  const requestedTokens = requestedNormalized.split(/\s+/).filter(Boolean);
  if (requestedTokens.length === 1 && requestedTokens[0].length <= 2) {
    const fields = normalize(variantFields);
    return Boolean(fields && new RegExp(`(^| )${requestedTokens[0]}($| )`).test(fields));
  }
  return getTitleCoverage(requested, evidence) >= 0.75;
}

function assessRetailerPageIdentity(seed: RetailerPageSeed, metadata: ReturnType<typeof parseProductMetadata>): RetailerPageIdentityMatch | null {
  if (!metadata.title || !metadata.price || !metadata.currency || metadata.price_conflict) return null;
  const conditionMatch = compareProductConditions(seed.condition, metadata.condition);
  if (conditionMatch === "alternative") return null;
  const targetGtin = digits(seed.gtin);
  const pageGtin = digits(metadata.gtin);
  if (targetGtin && pageGtin && targetGtin !== pageGtin) return null;
  const gtinMatch = Boolean(targetGtin && pageGtin && targetGtin === pageGtin);

  const titleAndModel = `${metadata.title} ${metadata.brand || ""} ${metadata.model_number || ""}`;
  const modelMatch = Boolean(seed.modelNumber && hasExactModel(seed.modelNumber, titleAndModel));
  const targetBrand = normalize(seed.brand);
  const foundBrand = normalize(metadata.brand);
  const brandMatch = !targetBrand || (foundBrand ? foundBrand === targetBrand || foundBrand.includes(targetBrand) : normalize(metadata.title).includes(targetBrand));
  if (!brandMatch && !gtinMatch) return null;
  if (seed.modelNumber && metadata.model_number && normalize(seed.modelNumber) !== normalize(metadata.model_number) && !gtinMatch) return null;

  const titleCoverage = getTitleCoverage(seed.title, titleAndModel);
  if (!gtinMatch && !(modelMatch && brandMatch) && titleCoverage < 0.8) return null;
  if (!matchesRequestedVariant(seed, metadata)) return null;

  if (gtinMatch) return conditionMatch === "unconfirmed"
    ? { confidence: 0.84, matchType: "retailer_page_verified_gtin_condition_unconfirmed" }
    : { confidence: 1, matchType: "retailer_page_verified_gtin" };
  if (modelMatch && brandMatch) return conditionMatch === "unconfirmed"
    ? { confidence: 0.84, matchType: "retailer_page_verified_model_condition_unconfirmed" }
    : { confidence: 0.98, matchType: "retailer_page_verified_model" };
  const titleConfidence = Math.min(0.96, 0.86 + Math.max(0, titleCoverage - 0.8) * 0.5);
  return conditionMatch === "unconfirmed"
    ? { confidence: Math.min(0.84, titleConfidence), matchType: "retailer_page_verified_title_condition_unconfirmed" }
    : { confidence: titleConfidence, matchType: "retailer_page_verified_title" };
}

export function retailerPageMatchesProduct(seed: RetailerPageSeed, metadata: ReturnType<typeof parseProductMetadata>): boolean {
  return assessRetailerPageIdentity(seed, metadata) !== null;
}

export async function inspectAndVerifyRetailerProductPage(
  url: string,
  seed: RetailerPageSeed,
  resolveDns: DnsResolver,
  transport: PinnedFetchTransport,
  now = new Date().toISOString(),
): Promise<RetailerPageVerificationAttempt> {
  const domain = getRetailerDomain(url);
  if (!domain) return { offer: null, finalUrl: url, status: null, errorCode: "invalid_url", evidence: { hasPrice: false, hasImage: false } };
  const robotsDecision = await retailerPageRobotsDecision(url, resolveDns, transport);
  if (robotsDecision !== "allowed") {
    return { offer: null, finalUrl: url, status: null, errorCode: robotsDecision === "restricted" ? "robots_restricted" : "robots_unavailable", evidence: { hasPrice: false, hasImage: false } };
  }
  let page;
  let redirectRobotsUnavailable = false;
  try {
    page = await fetchPinnedProductPage(url, resolveDns, transport, {
      maxBodyBytes: 1.5 * 1024 * 1024, timeoutMs: 5_000, maxRedirects: 3,
      onRedirect: async (target) => {
        const access = await retailerPageRobotsDecision(target.href, resolveDns, transport);
        if (access === "temporarily_unavailable") redirectRobotsUnavailable = true;
        return access === "allowed";
      },
    });
  } catch (error) {
    const errorCode = redirectRobotsUnavailable ? "robots_unavailable" : error instanceof Error && error.message.toLowerCase().includes("robots.txt") ? "robots_restricted" : "fetch_failed";
    return { offer: null, finalUrl: url, status: null, errorCode, evidence: { hasPrice: false, hasImage: false } };
  }
  if (getRetailerDomain(page.finalUrl.href) !== domain) {
    return { offer: null, finalUrl: page.finalUrl.href, status: page.status, errorCode: "cross_domain_product_redirect", evidence: { hasPrice: false, hasImage: false } };
  }
  if (page.status < 200 || page.status >= 300) {
    return { offer: null, finalUrl: page.finalUrl.href, status: page.status, errorCode: `http_${page.status}`, evidence: { hasPrice: false, hasImage: false } };
  }
  if (page.truncated) return { offer: null, finalUrl: page.finalUrl.href, status: page.status, errorCode: "response_truncated", evidence: { hasPrice: false, hasImage: false } };
  const contentType = page.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    return { offer: null, finalUrl: page.finalUrl.href, status: page.status, errorCode: "unsupported_format", evidence: { hasPrice: false, hasImage: false } };
  }
  const metadata = parseProductMetadata(new TextDecoder().decode(page.body), page.finalUrl.href);
  const evidence = { ...(metadata.title ? { title: metadata.title.slice(0, 300) } : {}), hasPrice: metadata.price != null, ...(metadata.currency ? { currency: metadata.currency } : {}), hasImage: Boolean(metadata.image_url) };
  if (!metadata.title) return { offer: null, finalUrl: page.finalUrl.href, status: page.status, errorCode: "product_metadata_missing", evidence };
  if (!metadata.price || !metadata.currency || metadata.price_conflict) {
    return { offer: null, finalUrl: page.finalUrl.href, status: page.status, errorCode: "product_price_or_currency_missing", evidence };
  }
  if (!isProductPriceCurrent(metadata.price, metadata.price_valid_until, Date.parse(now))) {
    return { offer: null, finalUrl: page.finalUrl.href, status: page.status, errorCode: "stale_price", evidence: { ...evidence, price_valid_until: metadata.price_valid_until } };
  }
  const identityMatch = assessRetailerPageIdentity(seed, metadata);
  if (!identityMatch || identityMatch.confidence < 0.9 || identityMatch.matchType.includes("unconfirmed")) return { offer: null, finalUrl: page.finalUrl.href, status: page.status, errorCode: "product_identity_not_confirmed", evidence };

  const host = page.finalUrl.hostname.replace(/^www\./i, "");
  const offer: VerifiedRetailerOffer = {
    item_id: seed.itemId,
    product_id: seed.productId,
    variant_id: seed.variantId,
    store: host.slice(0, 120),
    seller: host.slice(0, 120),
    listing_title: metadata.title!.slice(0, 300),
    image_url: metadata.image_url,
    size_label: metadata.variant_details.size || null,
    size_system: null,
    color_label: metadata.variant_details.color || null,
    product_match_confidence: identityMatch.confidence,
    match_type: identityMatch.matchType,
    is_verified: true,
    price: metadata.price!,
    currency: metadata.currency,
    url: page.finalUrl.href,
    canonical_url: metadata.canonical_url && getRetailerDomain(metadata.canonical_url) === domain ? metadata.canonical_url : null,
    product_gtin: metadata.gtin,
    product_sku: metadata.sku,
    product_model_number: metadata.model_number,
    gender_category: getGenderVariant([metadata.category || "", metadata.title || ""].join(" ")),
    original_price: metadata.original_price,
    discount_percent: metadata.discount_percent,
    shipping_cost: null,
    taxes: null,
    total_price: null,
    shipping_known: false,
    taxes_known: false,
    total_is_estimated: true,
    condition: normalizeProductCondition(metadata.condition),
    availability: metadata.availability,
    source: "retailer_page",
    last_verified_at: now,
    verification_status: metadata.availability === "out_of_stock" ? "unavailable" : "verified",
    verification_reason_code: metadata.availability === "out_of_stock" ? "retailer_page_out_of_stock" : "retailer_page_identity_price_currency_confirmed",
    verification_evidence: { ...evidence, model_number: metadata.model_number, sku: metadata.sku, gtin: metadata.gtin, variant: metadata.variant_name, canonical_url: metadata.canonical_url, price_valid_until: metadata.price_valid_until, availability: metadata.availability },
  };
  return { offer, finalUrl: page.finalUrl.href, status: page.status, errorCode: null, evidence };
}

export async function verifyRetailerProductPage(
  url: string,
  seed: RetailerPageSeed,
  resolveDns: DnsResolver,
  transport: PinnedFetchTransport,
  now = new Date().toISOString(),
): Promise<VerifiedRetailerOffer | null> {
  return (await inspectAndVerifyRetailerProductPage(url, seed, resolveDns, transport, now)).offer;
}
