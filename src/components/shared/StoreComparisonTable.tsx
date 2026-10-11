import React from 'react';
import { ExternalLink } from 'lucide-react';
import type { StoreOffer } from '@/types/database';
import { type Currency, formatPrice } from '@/lib/currency';
import { Button } from '@/components/ui/button';

interface StoreComparisonTableProps {
  offers: StoreOffer[];
  currency?: Currency;
  originalPrice?: number | null;
  originalCurrency?: Currency;
  className?: string;
}

export function StoreComparisonTable({
  offers,
  currency = 'MAD',
  originalPrice = null,
  originalCurrency = currency,
  className,
}: StoreComparisonTableProps) {
  if (!offers || offers.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-muted-foreground bg-card/40 rounded-2xl border border-border/40">
        No alternative store offers found for this item yet.
      </div>
    );
  }

  const isFresh = (offer: StoreOffer) => {
    const checked = Date.parse(offer.last_verified_at || '');
    return Number.isFinite(checked) && Date.now() - checked <= 24 * 60 * 60 * 1000;
  };
  const comparable = (offer: StoreOffer) => offer.currency === originalCurrency;
  const rankedValue = (offer: StoreOffer) => offer.total_price != null && !offer.total_is_estimated ? offer.total_price : offer.price;
  const eligible = offers.filter((offer) => isFresh(offer) && comparable(offer) && offer.condition === 'new' && offer.availability === 'in_stock');
  const best = eligible.length ? [...eligible].sort((a, b) => rankedValue(a) - rankedValue(b))[0] : null;
  const lowestListing = offers.filter((offer) => isFresh(offer) && comparable(offer)).sort((a, b) => rankedValue(a) - rankedValue(b))[0] || null;
  const headline = best || lowestListing;
  const savings = headline && originalPrice != null && originalPrice > headline.price ? originalPrice - headline.price : 0;
  const sortedOffers = [...offers].sort((a, b) => {
    const aReady = isFresh(a) && comparable(a) && a.total_price != null && !a.total_is_estimated;
    const bReady = isFresh(b) && comparable(b) && b.total_price != null && !b.total_is_estimated;
    if (aReady !== bReady) return aReady ? -1 : 1;
    const aComparable = isFresh(a) && comparable(a);
    const bComparable = isFresh(b) && comparable(b);
    if (aComparable !== bComparable) return aComparable ? -1 : 1;
    if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
    return rankedValue(a) - rankedValue(b);
  });

  return (
    <div className={`overflow-hidden rounded-2xl glass-card border border-border/50 ${className || ''}`}>
      {headline && <div className="p-3 border-b border-border/40 bg-emerald-500/5">
        <p className="text-xs font-semibold">{best ? 'Lowest fresh listing with known availability' : 'Lowest fresh provider listing'}: {formatPrice(headline.price, headline.currency as Currency)} at {headline.store}</p>
        <p className="text-[11px] text-muted-foreground">{savings > 0 ? `${formatPrice(savings, originalCurrency)} below the saved listing price` : 'Compared in the same currency.'} {best ? 'Final delivery cost can still differ.' : 'Variant, stock, seller condition, shipping, and taxes are not confirmed.'}</p>
      </div>}
      <div className="divide-y divide-border/40">
        {sortedOffers.map((offer) => {
          const verifiedAt = offer.last_verified_at ? Date.parse(offer.last_verified_at) : Number.NaN;
          const isStale = !Number.isFinite(verifiedAt) || Date.now() - verifiedAt > 24 * 60 * 60 * 1000;
          const availability = (offer.availability || 'unknown').replace(/_/g, ' ');
          const sameCurrency = comparable(offer);
          const knownTotal = offer.total_price != null && !offer.total_is_estimated;

          return (
            <div
              key={offer.id || offer.store}
              className="flex items-center justify-between p-3 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">🏬</span>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-foreground">
                      {offer.store}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {offer.condition || 'condition unknown'} · {availability}{isStale ? ' · stale provider result' : ` · provider checked ${new Date(offer.last_verified_at).toLocaleDateString()}`}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-foreground">
                  {formatPrice(knownTotal ? offer.total_price! : offer.price, offer.currency || currency)}
                  {offer.original_price != null && offer.original_price > offer.price && <span className="block text-[10px] text-muted-foreground line-through">{formatPrice(offer.original_price, offer.currency || currency)}{offer.discount_percent != null ? ` · ${offer.discount_percent}% off` : ''}</span>}
                  <span className="block text-[10px] text-muted-foreground font-normal">{knownTotal ? 'estimated purchase total' : 'item price; delivery/tax unknown'}{!sameCurrency ? ' · separate currency' : ''}</span>
                </span>
                <Button
                  size="sm"
                  asChild
                  className="h-7 px-2.5 rounded-lg text-[11px] gradient-primary text-white"
                >
                  <a
                    href={offer.affiliate_url || offer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1"
                  >
                    <span>View offer</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
