export interface OfferPriceEvidence {
  price: number;
  currency: string;
  total_price?: number | null;
  total_is_estimated?: boolean | null;
  converted_price?: number | null;
  converted_total_price?: number | null;
  currency_converted_to?: string | null;
}

function comparableTotal(offer: OfferPriceEvidence, currency: string): number | null {
  if (offer.currency === currency && offer.total_price != null && !offer.total_is_estimated) return offer.total_price;
  if (offer.currency_converted_to === currency && offer.converted_total_price != null) return offer.converted_total_price;
  return null;
}

function comparableItemPrice(offer: OfferPriceEvidence, currency: string): number | null {
  if (offer.currency === currency) return offer.price;
  if (offer.currency_converted_to === currency && offer.converted_price != null) return offer.converted_price;
  return null;
}

/** Sort by complete totals in the requested currency, then comparable item prices. */
export function compareOfferTotalPrice(a: OfferPriceEvidence, b: OfferPriceEvidence, currency: string): number {
  const aTotal = comparableTotal(a, currency);
  const bTotal = comparableTotal(b, currency);
  if ((aTotal != null) !== (bTotal != null)) return aTotal != null ? -1 : 1;
  if (aTotal != null && bTotal != null) return aTotal - bTotal;

  const aItem = comparableItemPrice(a, currency);
  const bItem = comparableItemPrice(b, currency);
  if ((aItem != null) !== (bItem != null)) return aItem != null ? -1 : 1;
  if (aItem != null && bItem != null) return aItem - bItem;
  if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
  return a.price - b.price;
}
