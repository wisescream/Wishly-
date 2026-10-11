export interface AlertItem {
  target_price: number | null;
  current_price: number | null;
  currency: string | null;
}

export interface AlertOffer {
  id: string;
  price: number;
  total_price: number | null;
  currency: string | null;
  condition: string | null;
  availability: string | null;
  last_verified_at: string | null;
  total_is_estimated: boolean | null;
}

export function getAlertObservation(item: AlertItem, offer: AlertOffer, now = Date.now()) {
  const checked = Date.parse(offer.last_verified_at || "");
  if (!Number.isFinite(checked) || now - checked > 24 * 60 * 60 * 1000) return null;
  if (!item.currency || offer.currency !== item.currency || offer.condition === "used" || offer.condition === "refurbished" || offer.availability === "out_of_stock") return null;
  const completeTotal = offer.total_price != null && offer.total_is_estimated === false;
  const price = completeTotal ? Number(offer.total_price) : Number(offer.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  const target = item.target_price != null && price <= item.target_price;
  const lower = item.current_price != null && price < item.current_price;
  if (!target && !lower) return null;
  const reason = target ? `target:${item.target_price}` : "lower-than-original";
  return { price, completeTotal, target, reason };
}

export function getAlertDeduplicationKey(itemId: string, offer: AlertOffer, observation: { price: number; reason: string }) {
  return `${itemId}:${offer.id}:${offer.currency}:${observation.price}:${observation.reason}`;
}
