import { describe, expect, it } from 'vitest';
import { evaluateProductMatch } from './productMatcher';
import { isValidGtin } from '@/lib/importService';

describe('product identity matching', () => {
  it('validates GTIN check digits and supported lengths', () => {
    expect(isValidGtin('036000291452')).toBe(true);
    expect(isValidGtin('036000291453')).toBe(false);
    expect(isValidGtin('12345')).toBe(false);
  });

  it('accepts the same GTIN as an exact match', () => {
    const result = evaluateProductMatch(
      { title: 'Sony WH-1000XM5', gtin: '4548736132575' },
      { title: 'Sony WH-1000XM5 Black', gtin: '4548736132575' },
    );
    expect(result.isExactMatch).toBe(true);
    expect(result.matchType).toBe('gtin');
  });

  it('rejects a conflicting GTIN even when titles match', () => {
    const result = evaluateProductMatch(
      { title: 'Sony WH-1000XM5', gtin: '4548736132575' },
      { title: 'Sony WH-1000XM5', gtin: '4548736132568' },
    );
    expect(result.isExactMatch).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it('matches exact manufacturer and model evidence', () => {
    const result = evaluateProductMatch(
      { title: 'Sony noise canceling headphones', brand: 'Sony', model_number: 'WH-1000XM5' },
      { title: 'Sony WH-1000XM5 wireless headphones', brand: 'Sony', model_number: 'WH-1000XM5' },
    );
    expect(result.matchType).toBe('brand_model');
    expect(result.isExactMatch).toBe(true);
  });

  it('rejects a different model instead of trusting title similarity', () => {
    const result = evaluateProductMatch(
      { title: 'Sony WH-1000XM5 Wireless Headphones', brand: 'Sony', model_number: 'WH-1000XM5' },
      { title: 'Sony WH-1000XM4 Wireless Headphones', brand: 'Sony', model_number: 'WH-1000XM4' },
    );
    expect(result.isExactMatch).toBe(false);
    expect(result.reason).toContain('model mismatch');
  });

  it('keeps different storage capacities and colors separate', () => {
    const capacity = evaluateProductMatch(
      { title: 'Apple iPhone 17 Pro 256GB Natural Titanium', brand: 'Apple' },
      { title: 'Apple iPhone 17 Pro 512GB Natural Titanium', brand: 'Apple' },
    );
    const color = evaluateProductMatch(
      { title: 'Apple iPhone 17 Pro 256GB Black', brand: 'Apple' },
      { title: 'Apple iPhone 17 Pro 256GB Silver', brand: 'Apple' },
    );
    expect(capacity.isExactMatch).toBe(false);
    expect(capacity.variantDifference).toContain('Capacity');
    expect(color.isExactMatch).toBe(false);
    expect(color.variantDifference).toContain('Color');
  });

  it('does not match new and refurbished listings as the same offer', () => {
    const result = evaluateProductMatch(
      { title: 'Sony WH-1000XM5', condition: 'new' },
      { title: 'Sony WH-1000XM5 refurbished', condition: 'refurbished' },
    );
    expect(result.isExactMatch).toBe(false);
  });
});
