import type { PricePoint } from '@/types/database';

export interface PriceHistorySummary {
  points: PricePoint[];
  current: number | null;
  previous: number | null;
  lowest: number | null;
  highest: number | null;
  percentChange: number | null;
}

export interface PriceHistorySeries {
  key: string;
  label: string;
  points: PricePoint[];
}

export function resolvePriceHistoryCurrency(points: PricePoint[], preferredCurrency: string, days = 365, now = Date.now()): string {
  const preferred = preferredCurrency.toUpperCase();
  const valid = (points || []).filter((point) => typeof point.currency === 'string'
    && /^[A-Z]{3}$/i.test(point.currency)
    && Number.isFinite(Date.parse(point.recorded_at))
    && Number.isFinite(Number(point.price)) && Number(point.price) > 0);
  const cutoff = now - Math.max(1, days) * 24 * 60 * 60 * 1000;
  const inPeriod = valid.filter((point) => Date.parse(point.recorded_at) >= cutoff && Date.parse(point.recorded_at) <= now);
  const candidates = inPeriod.length ? inPeriod : valid;
  if (candidates.some((point) => point.currency.toUpperCase() === preferred)) return preferred;
  return [...candidates]
    .sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at))[0]?.currency.toUpperCase() || preferred;
}

export function groupPriceHistoryByListing(points: PricePoint[]): PriceHistorySeries[] {
  const byKey = new Map<string, PriceHistorySeries>();
  for (const point of points || []) {
    const key = point.offer_id ? `offer:${point.offer_id}` : 'original';
    const current = byKey.get(key) || {
      key,
      label: point.offer_id ? `${point.store} offer` : `Original listing · ${point.store}`,
      points: [],
    };
    current.points.push(point);
    byKey.set(key, current);
  }
  return [...byKey.values()].sort((a, b) => a.key === 'original' ? -1 : b.key === 'original' ? 1 : a.label.localeCompare(b.label));
}

export function getPriceHistoryXPosition(timestamp: number, startTime: number, endTime: number, minX: number, maxX: number): number {
  const span = endTime - startTime;
  if (!Number.isFinite(timestamp) || !Number.isFinite(span) || span <= 0) return minX;
  const progress = Math.max(0, Math.min(1, (timestamp - startTime) / span));
  return minX + progress * (maxX - minX);
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
