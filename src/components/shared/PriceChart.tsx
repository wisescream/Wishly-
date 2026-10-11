import React from 'react';
import type { PricePoint } from '@/types/database';
import { type Currency, formatPrice } from '@/lib/currency';

interface PriceChartProps {
  pricePoints: PricePoint[];
  currency?: Currency;
  className?: string;
}

export function PriceChart({
  pricePoints,
  currency = 'MAD',
  className,
}: PriceChartProps) {
  if (!pricePoints || pricePoints.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-muted-foreground bg-card/40 rounded-2xl border border-border/40">
        No price history recorded yet
      </div>
    );
  }

  const sorted = [...pricePoints].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );

  const prices = sorted.map((p) => p.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice || 1;

  // Generate SVG path coordinates
  const width = 300;
  const height = 120;
  const paddingX = 20;
  const paddingY = 20;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;

  const points = sorted.map((p, index) => {
    const x = paddingX + (index / Math.max(sorted.length - 1, 1)) * chartWidth;
    const y = height - paddingY - ((p.price - minPrice) / range) * chartHeight;
    return { x, y, price: p.price, date: p.recorded_at };
  });

  const pathD = points.reduce((acc, point, index) => {
    return index === 0 ? `M ${point.x} ${point.y}` : `${acc} L ${point.x} ${point.y}`;
  }, '');

  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;

  return (
    <div className={`space-y-2 ${className || ''}`}>
      <div className="flex justify-between items-center text-[11px] text-muted-foreground px-1">
        <span>Min: <strong className="text-foreground">{formatPrice(minPrice, currency)}</strong></span>
        <span>Max: <strong className="text-foreground">{formatPrice(maxPrice, currency)}</strong></span>
      </div>

      <div className="relative w-full overflow-hidden rounded-2xl bg-card/60 backdrop-blur-md p-3 border border-border/50">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32 overflow-visible">
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaD} fill="url(#priceGradient)" />

          {/* Line stroke */}
          <path
            d={pathD}
            fill="none"
            stroke="#a855f7"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Points */}
          {points.map((pt, i) => (
            <circle
              key={i}
              cx={pt.x}
              cy={pt.y}
              r="3.5"
              className="fill-background stroke-purple-400 stroke-2"
            />
          ))}
        </svg>

        <div className="flex justify-between text-[10px] text-muted-foreground pt-1">
          <span>{new Date(sorted[0].recorded_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          <span>{new Date(sorted[sorted.length - 1].recorded_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        </div>
      </div>
    </div>
  );
}
