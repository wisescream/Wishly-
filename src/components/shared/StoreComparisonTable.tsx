import React from 'react';
import { ExternalLink } from 'lucide-react';
import type { StoreOffer } from '@/types/database';
import { type Currency, formatPrice } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import type { StyleProfile } from '@/types/database';
import { getOfferSizeMatch, getSizeRecommendationLabel, hasPreferredSize } from '@/lib/fashionSizes';
import { compareOfferFreshnessAndAvailability, compareOfferTotalPrice } from '@/lib/offerRanking';
import { compareProductConditions, formatProductCondition } from '@/lib/productCondition';
import { formatSellerType, matchesSellerType } from '@/lib/sellerType';

interface StoreComparisonTableProps {
  offers: StoreOffer[];
  currency?: Currency;
  originalPrice?: number | null;
  originalCurrency?: Currency;
  styleProfile?: StyleProfile | null;
  category?: string | null;
  itemCondition?: string | null;
  className?: string;
}

export function StoreComparisonTable({
  offers,
  currency = 'MAD',
  originalPrice = null,
  originalCurrency = currency,
  styleProfile = null,
  category = null,
  itemCondition = 'unknown',
  className,
}: StoreComparisonTableProps) {
  const [storeFilter, setStoreFilter] = React.useState('all');
  const [sellerTypeFilter, setSellerTypeFilter] = React.useState('all');
  const [conditionFilter, setConditionFilter] = React.useState('all');
  const [availabilityFilter, setAvailabilityFilter] = React.useState('all');
  const [shippingFilter, setShippingFilter] = React.useState('all');
  const [matchFilter, setMatchFilter] = React.useState('all');
  const [variantFilter, setVariantFilter] = React.useState('all');
  const [verificationFilter, setVerificationFilter] = React.useState('all');
  const [totalFilter, setTotalFilter] = React.useState('all');
  const [sortBy, setSortBy] = React.useState('best');
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
  const isHighConfidenceMatch = (offer: StoreOffer) => Number(offer.product_match_confidence || 0) >= 0.9
    && !String(offer.match_type || '').includes('unconfirmed')
    && compareProductConditions(itemCondition, offer.condition) === 'exact'
    && (!hasPreferredSize(styleProfile, category) || getOfferSizeMatch(styleProfile, category, offer.size_label, offer.size_system) === 'match');
  const comparable = (offer: StoreOffer) => offer.currency === currency
    || (offer.currency_converted_to === currency && offer.converted_price != null);
  const hasKnownTotal = (offer: StoreOffer) => offer.total_price != null && !offer.total_is_estimated;
  const hasComparableTotal = (offer: StoreOffer) => offer.currency === currency
    ? hasKnownTotal(offer)
    : offer.currency_converted_to === currency && offer.converted_total_price != null;
  const itemValue = (offer: StoreOffer) => offer.currency === currency
    ? offer.price
    : offer.currency_converted_to === currency ? offer.converted_price : null;
  const rankedValue = (offer: StoreOffer) => offer.currency === currency
    ? hasKnownTotal(offer) ? offer.total_price! : offer.price
    : hasComparableTotal(offer) ? offer.converted_total_price! : offer.converted_price ?? offer.price;
  const sizeRank = { match: 0, possible: 1, unknown: 2, no_match: 3 } as const;
  const sortOffers = (a: StoreOffer, b: StoreOffer) => {
    if (sortBy === 'item-price') {
      const aValue = itemValue(a);
      const bValue = itemValue(b);
      return Number(bValue != null) - Number(aValue != null) || (aValue != null && bValue != null ? aValue - bValue : a.currency.localeCompare(b.currency));
    }
    if (sortBy === 'total-price') {
      return compareOfferTotalPrice(a, b, currency);
    }
    if (sortBy === 'shipping') {
      const aKnown = Boolean(a.shipping_known);
      const bKnown = Boolean(b.shipping_known);
      if (aKnown !== bKnown) return aKnown ? -1 : 1;
      if (!aKnown) return a.currency.localeCompare(b.currency);
      return a.currency === b.currency ? Number(a.shipping_cost || 0) - Number(b.shipping_cost || 0) : a.currency.localeCompare(b.currency);
    }
    if (sortBy === 'retailer') return a.store.localeCompare(b.store);
    if (sortBy === 'recent') return Date.parse(b.last_verified_at || '') - Date.parse(a.last_verified_at || '');
    const evidenceRank = compareOfferFreshnessAndAvailability(a, b);
    if (evidenceRank) return evidenceRank;
    if (a.is_verified !== b.is_verified) return a.is_verified ? -1 : 1;
    const confidenceA = isHighConfidenceMatch(a);
    const confidenceB = isHighConfidenceMatch(b);
    if (confidenceA !== confidenceB) return confidenceA ? -1 : 1;
    const sizeA = sizeRank[getOfferSizeMatch(styleProfile, category, a.size_label, a.size_system)];
    const sizeB = sizeRank[getOfferSizeMatch(styleProfile, category, b.size_label, b.size_system)];
    if (sizeA !== sizeB) return sizeA - sizeB;
    const aReady = isFresh(a) && comparable(a) && hasComparableTotal(a);
    const bReady = isFresh(b) && comparable(b) && hasComparableTotal(b);
    if (aReady !== bReady) return aReady ? -1 : 1;
    const aComparable = isFresh(a) && comparable(a);
    const bComparable = isFresh(b) && comparable(b);
    if (aComparable !== bComparable) return aComparable ? -1 : 1;
    if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
    return rankedValue(a) - rankedValue(b);
  };
  const visibleOffers = offers.filter((offer) =>
    (storeFilter === 'all' || offer.store === storeFilter)
    && matchesSellerType(offer.seller_type, sellerTypeFilter)
    && (conditionFilter === 'all' || (offer.condition || 'unknown') === conditionFilter)
    && (availabilityFilter === 'all' || (offer.availability || 'unknown') === availabilityFilter)
    && (shippingFilter === 'all' || (shippingFilter === 'known' ? offer.shipping_known : !offer.shipping_known))
    && (matchFilter === 'all' || (matchFilter === 'exact' ? isHighConfidenceMatch(offer) : !isHighConfidenceMatch(offer)))
    && (variantFilter === 'all' || getOfferSizeMatch(styleProfile, category, offer.size_label, offer.size_system) === variantFilter)
    && (verificationFilter === 'all'
      || (verificationFilter === 'verified' ? offer.is_verified
        : verificationFilter === 'provider' ? !offer.is_verified && isFresh(offer)
          : !isFresh(offer)))
    && (totalFilter === 'all' || (totalFilter === 'known' ? hasComparableTotal(offer) : !hasComparableTotal(offer)))
  );
  const sortedOffers = [...visibleOffers].sort(sortOffers);
  const byItemPrice = (a: StoreOffer, b: StoreOffer) => (itemValue(a) ?? Number.POSITIVE_INFINITY) - (itemValue(b) ?? Number.POSITIVE_INFINITY);
  const byKnownTotal = (a: StoreOffer, b: StoreOffer) => (a.converted_total_price ?? a.total_price ?? Number.POSITIVE_INFINITY) - (b.converted_total_price ?? b.total_price ?? Number.POSITIVE_INFINITY);
  const matchingCandidates = sortedOffers.filter((offer) => offer.is_verified && isFresh(offer) && comparable(offer) && isHighConfidenceMatch(offer) && compareProductConditions(itemCondition, offer.condition) === 'exact' && offer.availability !== 'out_of_stock');
  const lowestListing = matchingCandidates.filter((offer) => itemValue(offer) != null).sort(byItemPrice)[0] || null;
  const lowestKnownTotal = matchingCandidates.filter(hasComparableTotal).sort(byKnownTotal)[0] || null;
  const savings = lowestListing && originalCurrency === currency && originalPrice != null && itemValue(lowestListing) != null && originalPrice > itemValue(lowestListing)! ? originalPrice - itemValue(lowestListing)! : 0;

  return (
    <div className={`overflow-hidden rounded-2xl glass-card border border-border/50 ${className || ''}`}>
      {(lowestListing || lowestKnownTotal) && <div className="grid gap-2 p-3 border-b border-border/40 bg-emerald-500/5 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold">Lowest retailer-confirmed item price: {lowestListing ? `${formatPrice(itemValue(lowestListing)!, currency)} at ${lowestListing.store}` : 'Unavailable in your preferred currency'}</p>
          <p className="text-[11px] text-muted-foreground">{savings > 0 ? `${formatPrice(savings, originalCurrency)} below the saved listing price` : 'Listing price only; shipping and taxes may be unknown.'}</p>
        </div>
        <div>
          <p className="text-xs font-semibold">Lowest known total: {lowestKnownTotal ? `${formatPrice(lowestKnownTotal.currency === currency ? lowestKnownTotal.total_price! : lowestKnownTotal.converted_total_price!, currency)} at ${lowestKnownTotal.store}` : 'No complete delivered total is available yet.'}</p>
          <p className="text-[11px] text-muted-foreground">Known shipping and tax evidence required; confirm final fees at checkout.</p>
        </div>
      </div>}
      {!matchingCandidates.length && <p className="px-3 py-2 border-b border-border/40 text-[11px] text-amber-700">No retailer page has confirmed an exact offer yet. Search results remain leads and are not used for price alerts.</p>}
      {itemCondition === 'unknown' && <p className="px-3 py-2 border-b border-border/40 text-[11px] text-amber-700">Set the saved item’s condition to compare it with condition-matched offers.</p>}
      <div className="flex flex-wrap gap-2 p-3 border-b border-border/40" aria-label="Offer comparison filters">
        <select aria-label="Sort offers" value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-[11px]"><option value="best">Best match and value</option><option value="item-price">Item price</option><option value="total-price">Known total first</option><option value="shipping">Shipping</option><option value="retailer">Retailer</option><option value="recent">Recently verified</option></select>
        <select aria-label="Filter by retailer" value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-[11px]"><option value="all">All retailers</option>{[...new Set(offers.map((offer) => offer.store))].sort().map((store) => <option key={store} value={store}>{store}</option>)}</select>
        <select aria-label="Filter by seller type" value={sellerTypeFilter} onChange={(event) => setSellerTypeFilter(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-[11px]"><option value="all">All seller types</option>{[...new Set(offers.map((offer) => offer.seller_type || 'unknown'))].sort().map((type) => <option key={type} value={type}>{formatSellerType(type)}</option>)}</select>
        <select aria-label="Filter by condition" value={conditionFilter} onChange={(event) => setConditionFilter(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-[11px]"><option value="all">All conditions</option>{[...new Set(offers.map((offer) => offer.condition || 'unknown'))].sort().map((condition) => <option key={condition} value={condition}>{condition}</option>)}</select>
        <select aria-label="Filter by availability" value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-[11px]"><option value="all">All stock states</option>{[...new Set(offers.map((offer) => offer.availability || 'unknown'))].sort().map((availability) => <option key={availability} value={availability}>{availability.replace(/_/g, ' ')}</option>)}</select>
        <select aria-label="Filter by shipping evidence" value={shippingFilter} onChange={(event) => setShippingFilter(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-[11px]"><option value="all">Any shipping evidence</option><option value="known">Shipping known</option><option value="unknown">Shipping unknown</option></select>
        <select aria-label="Filter by match" value={matchFilter} onChange={(event) => setMatchFilter(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-[11px]"><option value="all">All matches</option><option value="exact">High confidence</option><option value="possible">Possible matches</option></select>
        <select aria-label="Filter by variant match" value={variantFilter} onChange={(event) => setVariantFilter(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-[11px]"><option value="all">Any size match</option><option value="match">Matching size</option><option value="possible">Possible size match</option><option value="unknown">Size unknown</option><option value="no_match">Size mismatch</option></select>
        <select aria-label="Filter by verification status" value={verificationFilter} onChange={(event) => setVerificationFilter(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-[11px]"><option value="all">Any verification</option><option value="verified">Retailer page verified</option><option value="provider">Fresh provider result</option><option value="stale">Stale or unknown</option></select>
        <select aria-label="Filter by total cost" value={totalFilter} onChange={(event) => setTotalFilter(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-[11px]"><option value="all">Any cost evidence</option><option value="known">Known total</option><option value="unknown">Incomplete total</option></select>
      </div>
      <div className="divide-y divide-border/40">
        {sortedOffers.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">No offers match these filters.</p>}
        {sortedOffers.map((offer, index) => {
          const verifiedAt = offer.last_verified_at ? Date.parse(offer.last_verified_at) : Number.NaN;
          const isStale = !Number.isFinite(verifiedAt) || Date.now() - verifiedAt > 24 * 60 * 60 * 1000;
          const availability = (offer.availability || 'unknown').replace(/_/g, ' ');
          const sameCurrency = comparable(offer);
          const knownTotal = offer.total_price != null && !offer.total_is_estimated;
          const convertedTotal = hasComparableTotal(offer) && offer.currency !== currency;
          const convertedItemPrice = offer.currency !== currency && offer.currency_converted_to === currency && offer.converted_price != null;
          const displayedPrice = convertedTotal ? offer.converted_total_price! : convertedItemPrice ? offer.converted_price! : knownTotal ? offer.total_price! : offer.price;
          const displayedCurrency = convertedTotal || convertedItemPrice ? currency : offer.currency;
          const sizeMatch = getOfferSizeMatch(styleProfile, category, offer.size_label, offer.size_system);
          const exactMatch = isHighConfidenceMatch(offer);
          const previousExactMatch = index > 0 && isHighConfidenceMatch(sortedOffers[index - 1]);

          return (
            <React.Fragment key={offer.id || offer.store}>
              {index === 0 && <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{exactMatch ? 'Likely exact product matches' : 'Possible matches and alternatives · confirm the product and variant'}</div>}
              {index > 0 && exactMatch !== previousExactMatch && <div className="px-3 py-2 border-t border-border/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{exactMatch ? 'Likely exact product matches' : 'Possible matches and alternatives · confirm the product and variant'}</div>}
              <div className="flex items-center justify-between p-3 hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-3">
                {offer.image_url ? <img src={offer.image_url} alt="" className="h-10 w-10 rounded-lg object-contain bg-white/70" loading="lazy" /> : <span className="text-xl">🏬</span>}
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-foreground">
                      {offer.store}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {formatProductCondition(offer.condition)} · {availability}{isStale ? ' · stale result' : offer.is_verified ? ` · retailer page checked ${new Date(offer.last_verified_at).toLocaleDateString()}` : ` · provider checked ${new Date(offer.last_verified_at).toLocaleDateString()}`}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">Seller type: {formatSellerType(offer.seller_type)}</span>
                  {offer.listing_title && <span className="block max-w-52 text-[10px] text-muted-foreground line-clamp-2">{offer.listing_title}</span>}
                  <span className={`block text-[10px] ${isHighConfidenceMatch(offer) ? 'text-emerald-600' : 'text-amber-600'}`}>{isHighConfidenceMatch(offer) ? 'High-confidence product match' : 'Possible match · confirm model and variant'}{offer.source === 'openrouter_web_search' ? ' · web snippet price; verify at retailer' : ''}</span>
                  {!offer.is_verified && <span className="block text-[10px] text-amber-600">Provider price; retailer page not confirmed</span>}
                  {offer.size_label && <span className="block text-[10px] text-muted-foreground">Size {offer.size_label}</span>}
                  {styleProfile && category && <span className={`block text-[10px] ${sizeMatch === 'match' ? 'text-emerald-600' : 'text-muted-foreground'}`}>{getSizeRecommendationLabel(sizeMatch)}</span>}
                  <span className="block text-[10px] text-muted-foreground">{offer.shipping_known ? `Shipping ${formatPrice(Number(offer.shipping_cost || 0), offer.currency || currency)}` : 'Shipping unknown'}{offer.delivery_estimate ? ` · ${offer.delivery_estimate}` : ''}{offer.taxes_known ? ` · taxes ${formatPrice(Number(offer.taxes || 0), offer.currency || currency)}` : ' · taxes unknown'}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-foreground">
                  {formatPrice(displayedPrice, displayedCurrency || currency)}
                  {(convertedTotal || convertedItemPrice) && <span className="block text-[10px] font-normal text-muted-foreground">{formatPrice(offer.price, offer.currency)} original{offer.exchange_rate_at ? ` · rate date ${new Date(offer.exchange_rate_at).toLocaleDateString()}` : ''}</span>}
                  {offer.original_price != null && offer.original_price > offer.price && <span className="block text-[10px] text-muted-foreground line-through">{formatPrice(offer.original_price, offer.currency || currency)}{offer.discount_percent != null ? ` · ${offer.discount_percent}% off` : ''}</span>}
                  <span className="block text-[10px] text-muted-foreground font-normal">{convertedTotal || knownTotal ? 'known purchase total' : 'item price; delivery/tax unknown'}{(convertedTotal || convertedItemPrice) ? ` · converted using ${offer.exchange_rate_source || 'reference FX'}` : !sameCurrency ? ' · separate currency' : ''}</span>
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
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
