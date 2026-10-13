import { describe, expect, it } from 'vitest';
import { formatSellerType, matchesSellerType } from './sellerType';

describe('seller type offer filtering', () => {
  it('keeps unknown merchants in the unknown filter without treating them as trusted', () => {
    expect(matchesSellerType(null, 'unknown')).toBe(true);
    expect(matchesSellerType(undefined, 'official')).toBe(false);
  });

  it('matches explicit seller classes and accepts all classes in the all filter', () => {
    expect(matchesSellerType('second_hand', 'second_hand')).toBe(true);
    expect(matchesSellerType('marketplace', 'outlet')).toBe(false);
    expect(matchesSellerType('marketplace', 'all')).toBe(true);
  });

  it('formats stored seller type values for display', () => {
    expect(formatSellerType('second_hand')).toBe('second hand');
    expect(formatSellerType(null)).toBe('unknown');
  });
});
