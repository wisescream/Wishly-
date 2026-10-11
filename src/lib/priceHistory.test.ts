import { describe, expect, it } from 'vitest';
import type { PricePoint } from '@/types/database';
import { summarizePriceHistory } from './priceHistory';

const now = Date.parse('2026-10-10T12:00:00Z');
const point = (id: string, price: number, currency: string, daysAgo: number): PricePoint => ({
  id, item_id: 'item-1', price, currency, store: 'Store', source: 'test', offer_id: null,
  availability: 'unknown', source_url: null, is_verified: false, observation_day: '2026-10-01',
  recorded_at: new Date(now - daysAgo * 86_400_000).toISOString(),
});

describe('summarizePriceHistory', () => {
  it('filters by currency and range and calculates current, previous and period change', () => {
    const summary = summarizePriceHistory([
      point('old', 50, 'MAD', 40), point('a', 100, 'MAD', 10),
      point('b', 80, 'MAD', 5), point('foreign', 1, 'USD', 2),
    ], 'MAD', 30, now);
    expect(summary.points.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(summary.current).toBe(80);
    expect(summary.previous).toBe(100);
    expect(summary.lowest).toBe(80);
    expect(summary.highest).toBe(100);
    expect(summary.percentChange).toBe(-20);
  });

  it('returns empty and insufficient data without fabricating values', () => {
    const empty = summarizePriceHistory([], 'EUR', 7, now);
    expect(empty.points).toEqual([]);
    expect(empty.current).toBeNull();
    expect(empty.percentChange).toBeNull();
    const single = summarizePriceHistory([point('one', 12, 'EUR', 1)], 'EUR', 7, now);
    expect(single.current).toBe(12);
    expect(single.previous).toBeNull();
    expect(single.percentChange).toBeNull();
  });

  it('ignores invalid, future, and non-positive observations', () => {
    const invalid = { ...point('bad', -3, 'MAD', 1), recorded_at: 'not-a-date' };
    const future = { ...point('future', 4, 'MAD', 0), recorded_at: new Date(now + 1000).toISOString() };
    expect(summarizePriceHistory([invalid, future], 'MAD', 30, now).points).toEqual([]);
  });
});
