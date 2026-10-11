import type { PricePoint } from '@/types/database';

export interface PriceHistorySummary {
  points: PricePoint[];
  current: number | null;
  previous: number | null;
  lowest: number | null;
  highest: number | null;
  percentChange: number | null;
}

export function summarizePriceHistory(points: PricePoint[], currency: string, days: number, now = Date.now()): PriceHistorySummary {
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  const filtered = (points || [])
    .filter((point) => point.currency === currency && Number.isFinite(Number(point.price)) && Number(point.price) > 0)
    .filter((point) => Number.isFinite(Date.parse(point.recorded_at)) && Date.parse(point.recorded_at) >= cutoff && Date.parse(point.recorded_at) <= now)
    .sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
  const values = filtered.map((point) => Number(point.price));
  const current = values.length ? values[values.length - 1] : null;
  const previous = values.length > 1 ? values[values.length - 2] : null;
  const percentChange = values.length > 1 && values[0] > 0 && current != null ? ((current - values[0]) / values[0]) * 100 : null;
  return {
    points: filtered,
    current,
    previous,
    lowest: values.length ? Math.min(...values) : null,
    highest: values.length ? Math.max(...values) : null,
    percentChange,
  };
}
