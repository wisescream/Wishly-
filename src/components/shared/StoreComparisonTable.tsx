import React from 'react';
import { ExternalLink } from 'lucide-react';
import type { StoreOffer } from '@/types/database';
import { type Currency, formatPrice } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import type { StyleProfile } from '@/types/database';
import { getOfferSizeMatch, getSizeRecommendationLabel } from '@/lib/fashionSizes';

interface StoreComparisonTableProps {
  offers: StoreOffer[];
  currency?: Currency;
  originalPrice?: number | null;
  originalCurrency?: Currency;
  styleProfile?: StyleProfile | null;
  category?: string | null;
  className?: string;
}

export function StoreComparisonTable({
  offers,
  currency = 'MAD',
  originalPrice = null,
  originalCurrency = currency,
  styleProfile = null,
  category = null,
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
  const isHighConfidenceMatch = (offer: StoreOffer) => Number(offer.product_match_confidence || 0) >= 0.9 && !String(offer.match_type || '').includes('unconfirmed');
  const comparable = (offer: StoreOffer) => offer.currency === originalCurrency;
  const rankedValue = (offer: StoreOffer) => offer.total_price != null && !offer.total_is_estimated ? offer.total_price : offer.price;
  const eligible = offers.filter((offer) => isFresh(offer) && comparable(offer) && offer.condition === 'new' && offer.availability === 'in_stock');
  const best = eligible.filter(isHighConfidenceMatch).length ? [...eligible.filter(isHighConfidenceMatch)].sort((a, b) => rankedValue(a) - rankedValue(b))[0] : null;
  const lowestListing = offers.filter((offer) => isFresh(offer) && comparable(offer)).sort((a, b) => rankedValue(a) - rankedValue(b))[0] || null;
  const headline = best || lowestListing;
  const savings = headline && originalPrice != null && originalPrice > headline.price ? originalPrice - headline.price : 0;
  const sizeRank = { match: 0, possible: 1, unknown: 2, no_match: 3 } as const;
  const sortedOffers = [...offers].sort((a, b) => {
    const sizeA = sizeRank[getOfferSizeMatch(styleProfile, category, a.size_label, a.size_system)];
    const sizeB = sizeRank[getOfferSizeMatch(styleProfile, category, b.size_label, b.size_system)];
    if (sizeA !== sizeB) return sizeA - sizeB;
    const confidenceA = isHighConfidenceMatch(a);
    const confidenceB = isHighConfidenceMatch(b);
    if (confidenceA !== confidenceB) return confidenceA ? -1 : 1;
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
        <p className="text-xs font-semibold">{best ? 'Lowest fresh high-confidence match with known availability' : isHighConfidenceMatch(headline) ? 'Lowest fresh high-confidence product match' : 'Lowest possible retailer match — confirm the exact model'}: {formatPrice(headline.price, headline.currency as Currency)} at {headline.store}</p>
        <p className="text-[11px] text-muted-foreground">{savings > 0 && isHighConfidenceMatch(headline) ? `${formatPrice(savings, originalCurrency)} below the saved listing price` : savings > 0 ? `The listed amount is ${formatPrice(savings, originalCurrency)} lower if the item and price are current and exact.` : 'Compared in the same currency.'} {best ? 'Final delivery cost can still differ.' : 'Availability, shipping, and taxes are not confirmed.'}</p>
      </div>}
      <div className="divide-y divide-border/40">
        {sortedOffers.map((offer) => {
          const verifiedAt = offer.last_verified_at ? Date.parse(offer.last_verified_at) : Number.NaN;
          const isStale = !Number.isFinite(verifiedAt) || Date.now() - verifiedAt > 24 * 60 * 60 * 1000;
          const availability = (offer.availability || 'unknown').replace(/_/g, ' ');
          const sameCurrency = comparable(offer);
          const knownTotal = offer.total_price != null && !offer.total_is_estimated;
          const sizeMatch = getOfferSizeMatch(styleProfile, category, offer.size_label, offer.size_system);

          return (
            <div
              key={offer.id || offer.store}
              className="flex items-center justify-between p-3 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                {offer.image_url ? <img src={offer.image_url} alt="" className="h-10 w-10 rounded-lg object-contain bg-white/70" loading="lazy" /> : <span className="text-xl">🏬</span>}
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-foreground">
                      {offer.store}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {offer.condition || 'condition unknown'} · {availability}{isStale ? ' · stale provider result' : ` · provider checked ${new Date(offer.last_verified_at).toLocaleDateString()}`}
                  </span>
                  {offer.listing_title && <span className="block max-w-52 text-[10px] text-muted-foreground line-clamp-2">{offer.listing_title}</span>}
                  <span className={`block text-[10px] ${isHighConfidenceMatch(offer) ? 'text-emerald-600' : 'text-amber-600'}`}>{isHighConfidenceMatch(offer) ? 'High-confidence product match' : 'Possible match · confirm model and variant'}{offer.source === 'openrouter_web_search' ? ' · web snippet price; verify at retailer' : ''}</span>
                  {offer.size_label && <span className="block text-[10px] text-muted-foreground">Size {offer.size_label}</span>}
                  {styleProfile && category && <span className={`block text-[10px] ${sizeMatch === 'match' ? 'text-emerald-600' : 'text-muted-foreground'}`}>{getSizeRecommendationLabel(sizeMatch)}</span>}
                  <span className="block text-[10px] text-muted-foreground">{offer.shipping_known ? `Shipping ${formatPrice(Number(offer.shipping_cost || 0), offer.currency || currency)}` : 'Shipping unknown'}{offer.taxes_known ? ` · taxes ${formatPrice(Number(offer.taxes || 0), offer.currency || currency)}` : ' · taxes unknown'}</span>
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
