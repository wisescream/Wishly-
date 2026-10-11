import React, { useMemo, useState } from 'react';
import type { PricePoint } from '@/types/database';
import { type Currency, formatPrice } from '@/lib/currency';
import { summarizePriceHistory } from '@/lib/priceHistory';

const ranges = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '6M', days: 183 },
  { label: '1Y', days: 365 },
] as const;

interface PriceChartProps {
  pricePoints: PricePoint[];
  currency?: Currency;
  className?: string;
}

export function PriceChart({ pricePoints, currency = 'MAD', className }: PriceChartProps) {
  const [days, setDays] = useState<number>(30);
  const summary = useMemo(() => summarizePriceHistory(pricePoints, currency, days), [pricePoints, currency, days]);
  const { points: history, current, previous, lowest: minPrice, highest: maxPrice, percentChange: change } = summary;

  const width = 300;
  const height = 120;
  const paddingX = 20;
  const paddingY = 18;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;
  const min = minPrice ?? 0;
  const max = maxPrice ?? 0;
  const spread = max - min || Math.max(max * 0.05, 1);
  const points = history.map((point, index) => ({
    x: paddingX + (index / Math.max(history.length - 1, 1)) * chartWidth,
    y: height - paddingY - ((Number(point.price) - min) / spread) * chartHeight,
    point,
  }));
  const pathD = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaD = points.length > 1 ? `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z` : '';

  return (
    <div className={`space-y-3 ${className || ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1" role="group" aria-label="Price history date range">
          {ranges.map((range) => (
            <button key={range.days} type="button" onClick={() => setDays(range.days)} aria-pressed={days === range.days}
              className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold ${days === range.days ? 'bg-primary text-primary-foreground' : 'bg-card/60 text-muted-foreground'}`}>
              {range.label}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground">{history.length} observation{history.length === 1 ? '' : 's'} · {currency}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ['Current', current], ['Previous', previous], ['Lowest', minPrice], ['Highest', maxPrice],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-border/40 bg-card/40 p-2">
            <span className="block text-[10px] text-muted-foreground">{label}</span>
            <strong className="text-xs">{typeof value === 'number' ? formatPrice(value, currency) : '—'}</strong>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-muted-foreground">
        Change over this period: <strong className={change == null ? '' : change < 0 ? 'text-emerald-600' : change > 0 ? 'text-rose-500' : ''}>
          {change == null ? 'Not enough observations' : `${change > 0 ? '+' : ''}${change.toFixed(1)}%`}
        </strong>
      </div>

      {history.length < 2 ? (
        <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-border/40 bg-card/40 px-4 text-center">
          <p className="text-xs font-medium">{history.length ? 'One price observation recorded' : 'No price history for this period'}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">{history.length ? 'A chart will appear after another valid price change is observed.' : 'Wishly will add a point when a supported source returns a valid price.'}</p>
        </div>
      ) : (
        <div className="relative w-full overflow-hidden rounded-2xl border border-border/50 bg-card/60 p-3">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-32 w-full" role="img" aria-label={`Price history for the last ${days} days`}>
            <defs><linearGradient id="wishly-price-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7c3aed" stopOpacity="0.35" /><stop offset="100%" stopColor="#7c3aed" stopOpacity="0" /></linearGradient></defs>
            <path d={areaD} fill="url(#wishly-price-gradient)" />
            <path d={pathD} fill="none" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {points.map(({ x, y, point }) => <circle key={point.id} cx={x} cy={y} r="3.5" fill={point.is_verified ? '#fff' : '#fbbf24'} stroke={point.is_verified ? '#a855f7' : '#d97706'} strokeWidth="2"><title>{formatPrice(Number(point.price), currency)} · {new Date(point.recorded_at).toLocaleString()} · {point.is_verified ? 'verified' : 'unverified observation'}</title></circle>)}
          </svg>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{new Date(history[0].recorded_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            <span>{new Date(history[history.length - 1].recorded_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">Historical price observations · amber points are unverified</p>
        </div>
      )}
    </div>
  );
}
