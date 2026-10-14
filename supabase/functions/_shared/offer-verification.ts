export interface PersistableOffer {
  item_id: string;
  source: string;
  url: string;
  is_verified?: boolean;
  verification_status?: string;
  verification_reason_code?: string | null;
  verification_evidence?: Record<string, unknown>;
  last_verified_at?: string | null;
  last_checked_at?: string | null;
  [key: string]: unknown;
}

export function withOfferVerificationEvidence<T extends PersistableOffer>(offer: T): T {
  const verified = offer.is_verified === true && Number(offer.product_match_confidence || 0) >= 0.9
    && !String(offer.match_type || "").includes("unconfirmed");
  const unavailable = offer.availability === "out_of_stock";
  const evidence = offer.verification_evidence || {
    source: offer.source,
    source_url: offer.source_url || offer.url,
    product_title: offer.listing_title || null,
    image_url: offer.image_url || null,
    product_gtin: offer.product_gtin || null,
    product_sku: offer.product_sku || null,
    product_model_number: offer.product_model_number || null,
    color: offer.color_label || null,
    size: offer.size_label || null,
    gender_category: offer.gender_category || null,
    price: offer.price ?? null,
    currency: offer.currency || null,
    availability: offer.availability || "unknown",
    match_type: offer.match_type || null,
    match_confidence: offer.product_match_confidence ?? null,
  };
  const unknownShipping = offer.shipping_known !== true;
  const unknownTaxes = offer.taxes_known !== true;
  const checkedAt = offer.last_checked_at || offer.last_verified_at || new Date().toISOString();
  return {
    ...offer,
    source_url: offer.source_url || offer.url,
    canonical_url: offer.canonical_url || (verified ? offer.url : null),
    is_verified: verified,
    verification_status: verified ? unavailable ? "unavailable" : "verified" : "unverified",
    last_checked_at: checkedAt,
    last_verified_at: verified ? offer.last_verified_at || checkedAt : null,
    verification_reason_code: verified
      ? unavailable ? "retailer_page_out_of_stock" : "retailer_page_identity_price_currency_confirmed"
      : "search_candidate_requires_product_page_verification",
    verification_evidence: evidence,
    shipping_cost: unknownShipping ? null : offer.shipping_cost,
    taxes: unknownTaxes ? null : offer.taxes,
  };
}

export function preserveExistingVerifiedOffers<T extends PersistableOffer>(existing: PersistableOffer[], incoming: T[]): T[] {
  const verifiedKeys = new Set(existing
    .filter((offer) => offer.is_verified === true || offer.verification_status === "verified")
    .map((offer) => `${offer.source}\n${offer.url}`));
  return incoming.filter((offer) => offer.is_verified === true || !verifiedKeys.has(`${offer.source}\n${offer.url}`));
}
