import { describe, expect, it } from "vitest";
import { preserveExistingVerifiedOffers, withOfferVerificationEvidence } from "./offer-verification.ts";

describe("offer verification persistence", () => {
  const base = {
    item_id: "item-1", source: "retailer_page", url: "https://shop.example/p", price: 100, currency: "MAD",
    shipping_cost: 0, taxes: 0, shipping_known: false, taxes_known: false,
    listing_title: "Exact product", product_match_confidence: 0.98, match_type: "retailer_page_verified_model",
    is_verified: true, availability: "in_stock",
  };

  it("keeps unknown shipping and tax values null instead of treating them as zero", () => {
    expect(withOfferVerificationEvidence(base)).toMatchObject({ shipping_cost: null, taxes: null, verification_status: "verified" });
  });

  it("does not upgrade an unverified search candidate based on its title or price", () => {
    const candidate = withOfferVerificationEvidence({ ...base, source: "google_shopping", is_verified: false, match_type: "brand_model_variant" });
    expect(candidate).toMatchObject({ is_verified: false, verification_status: "unverified", verification_reason_code: "search_candidate_requires_product_page_verification", canonical_url: null });
  });

  it("preserves an existing verified listing when a later refresh only finds an unverified candidate", () => {
    const existing = [{ source: "retailer_page", url: "https://shop.example/p", is_verified: true }];
    const incoming = [{ ...base, source: "google_shopping", is_verified: false }, { ...base, is_verified: false }];
    expect(preserveExistingVerifiedOffers(existing, incoming).map((offer) => offer.source)).toEqual(["google_shopping"]);
  });

  it("allows an actually verified replacement and marks out-of-stock evidence explicitly", () => {
    expect(preserveExistingVerifiedOffers([{ source: base.source, url: base.url, is_verified: true }], [base])).toEqual([base]);
    expect(withOfferVerificationEvidence({ ...base, availability: "out_of_stock" }).verification_status).toBe("unavailable");
  });
});
