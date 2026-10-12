import { describe, expect, it } from 'vitest';
import { compareOfferTotalPrice } from './offerRanking';

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
