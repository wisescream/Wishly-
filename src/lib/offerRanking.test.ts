import { describe, expect, it } from 'vitest';
import { compareOfferFreshnessAndAvailability, compareOfferTotalPrice } from './offerRanking';

describe('offer total price ranking', () => {
  it('ranks known totals in the selected currency ahead of incomplete costs', () => {
    const known = { price: 90, currency: 'EUR', converted_price: 99, converted_total_price: 120, currency_converted_to: 'USD' };
    const incomplete = { price: 80, currency: 'USD', total_price: null };
    expect(compareOfferTotalPrice(known, incomplete, 'USD')).toBeLessThan(0);
  });

  it('uses converted item prices for incomplete totals', () => {
    const converted = { price: 100, currency: 'EUR', converted_price: 110, currency_converted_to: 'USD' };
    const local = { price: 120, currency: 'USD' };
    expect(compareOfferTotalPrice(converted, local, 'USD')).toBeLessThan(0);
  });

  it('never compares raw amounts across currencies without conversion evidence', () => {
    const euros = { price: 50, currency: 'EUR' };
    const dollars = { price: 100, currency: 'USD' };
    expect(compareOfferTotalPrice(euros, dollars, 'MAD')).toBe('EUR'.localeCompare('USD'));
  });
});

describe('default offer evidence ranking', () => {
  const now = Date.parse('2026-10-12T12:00:00Z');

  it('prefers a fresh provider observation to a stale retailer-verified price', () => {
    const staleVerified = { last_verified_at: '2026-10-10T12:00:00Z', availability: 'in_stock' };
    const freshProvider = { last_verified_at: '2026-10-12T11:00:00Z', availability: 'unknown' };
    expect(compareOfferFreshnessAndAvailability(freshProvider, staleVerified, now)).toBeLessThan(0);
  });

  it('prefers known in-stock availability when freshness is equal', () => {
    const inStock = { last_verified_at: '2026-10-12T11:00:00Z', availability: 'in_stock' };
    const outOfStock = { last_verified_at: '2026-10-12T11:00:00Z', availability: 'out_of_stock' };
    expect(compareOfferFreshnessAndAvailability(inStock, outOfStock, now)).toBeLessThan(0);
  });

  it('treats unknown and malformed timestamps as stale evidence', () => {
    const unknown = { availability: 'unknown' };
    const malformed = { last_verified_at: 'not-a-time', availability: 'unknown' };
    const fresh = { last_verified_at: '2026-10-12T11:00:00Z', availability: 'unknown' };
    expect(compareOfferFreshnessAndAvailability(fresh, unknown, now)).toBeLessThan(0);
    expect(compareOfferFreshnessAndAvailability(unknown, malformed, now)).toBe(0);
  });
});
