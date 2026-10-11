import { describe, expect, it } from 'vitest';
import type { StoreOffer, StyleProfile } from '@/types/database';
import { getOfferSizeMatch, getSizeRecommendationLabel, rankSizeAwareOffers } from './fashionSizes';

const profile = {
  sizing_context: 'womens',
  apparel_sizes: {
    tops: { actual: 'M', preferred: 'L', alternatives: ['XL'], system: 'International' },
    bottoms: { actual: '30', preferred: '32', alternatives: [], system: 'US' },
  },
  shoe_sizes: { actual: { value: '39', system: 'EU' }, preferred: { value: '40', system: 'EU' }, alternatives: ['41'] },
} as unknown as StyleProfile;

const offer = (id: string, size: string | null, price: number, extra: Partial<StoreOffer> = {}) => ({
  id, item_id: 'item', product_id: null, variant_id: null, store: id, price, currency: 'MAD',
  size_label: size, size_system: null, condition: 'new', availability: 'unknown', source: 'test',
  url: `https://example.com/${id}`, last_verified_at: new Date().toISOString(),
  shipping_cost: 0, taxes: 0, total_price: null, total_is_estimated: true,
  shipping_known: false, taxes_known: false, original_price: null, discount_percent: null,
  delivery_estimate: null, affiliate_url: null, updated_at: new Date().toISOString(),
  seller: null, destination_country: null, currency_converted_to: null, converted_price: null,
  exchange_rate: null, exchange_rate_at: null, last_error: null, listing_title: null,
  image_url: null, color_label: null, product_match_confidence: null, match_type: null,
  ...extra,
} as StoreOffer);

describe('fashion size matching', () => {
  it('keeps actual, preferred, and user-approved alternatives distinct', () => {
    expect(getOfferSizeMatch(profile, 'tops', 'L')).toBe('match');
    expect(getOfferSizeMatch(profile, 'tops', 'M')).toBe('match');
    expect(getOfferSizeMatch(profile, 'tops', 'XL')).toBe('possible');
    expect(getOfferSizeMatch(profile, 'tops', 'S')).toBe('no_match');
  });

  it('does not claim an exact shoe match without a compatible sizing system', () => {
    expect(getOfferSizeMatch(profile, 'footwear', '40')).toBe('possible');
    expect(getOfferSizeMatch(profile, 'footwear', '40', 'EU')).toBe('match');
    expect(getOfferSizeMatch(profile, 'footwear', '40', 'US women')).toBe('no_match');
    expect(getOfferSizeMatch(profile, 'footwear', null)).toBe('unknown');
  });

  it('uses category-specific bottoms instead of reusing top sizes', () => {
    expect(getOfferSizeMatch(profile, 'Jeans', '32')).toBe('match');
    expect(getOfferSizeMatch(profile, 'Jeans', 'L')).toBe('no_match');
  });

  it('prioritizes size compatible offers before cheaper incompatible variants', () => {
    const ranked = rankSizeAwareOffers([offer('wrong', 'S', 5), offer('match', 'L', 100), offer('unknown', null, 10)], profile, 'tops');
    expect(ranked.map((entry) => entry.id)).toEqual(['match', 'unknown', 'wrong']);
    expect(getSizeRecommendationLabel('possible')).toContain('Possible size match');
  });
});
