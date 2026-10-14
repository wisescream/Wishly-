import { compareProductConditions } from "./product-condition.ts";

export interface AlertItem {
  target_price: number | null;
  current_price: number | null;
  currency: string | null;
  condition: string | null;
  price_drop_percent: number | null;
  alert_on_any_lower_price: boolean;
  alert_on_new_cheaper_offer: boolean;
  alert_on_back_in_stock: boolean;
}

export interface AlertOffer {
  id: string;
  is_verified: boolean;
  price: number;
  total_price: number | null;
  currency: string | null;
  condition: string | null;
  availability: string | null;
  last_verified_at: string | null;
  total_is_estimated: boolean | null;
  shipping_known?: boolean | null;
  taxes_known?: boolean | null;
  product_match_confidence: number | null;
  created_at?: string | null;
}

export function getAlertSourceLabel(source: string | null | undefined): string {
  if (source === "retailer_page") return "Retailer product page";
  if (source === "openrouter_web_search" || source === "tavily_web_search") return "Web search snippet";
  if (source === "google_shopping") return "Google Shopping";
  return "Configured search source";
}

export function getAlertObservation(item: AlertItem, offer: AlertOffer, now = Date.now()) {
  if (offer.is_verified !== true) return null;
  if (Number(offer.product_match_confidence || 0) < 0.9) return null;
  const checked = Date.parse(offer.last_verified_at || "");
  if (!Number.isFinite(checked) || now - checked > 24 * 60 * 60 * 1000) return null;
  if (!item.currency || offer.currency !== item.currency || compareProductConditions(item.condition, offer.condition) !== "exact" || offer.availability === "out_of_stock") return null;
  const completeTotal = offer.total_price != null && offer.total_is_estimated === false;
  const price = completeTotal ? Number(offer.total_price) : Number(offer.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  const target = item.target_price != null && price <= item.target_price;
  const belowOriginal = item.current_price != null && price < item.current_price;
  const percentage = Boolean(item.price_drop_percent != null && item.current_price != null && price <= item.current_price * (1 - item.price_drop_percent / 100));
  const anyLower = item.alert_on_any_lower_price && belowOriginal;
  const createdAt = Date.parse(offer.created_at || "");
  const newCheaper = item.alert_on_new_cheaper_offer && belowOriginal && Number.isFinite(createdAt) && createdAt <= now && now - createdAt <= 24 * 60 * 60 * 1000;
  if (!target && !percentage && !anyLower && !newCheaper) return null;
  const reason = target ? `target:${item.target_price}` : percentage ? `drop:${item.price_drop_percent}` : newCheaper ? "new-cheaper-offer" : "lower-than-original";
  const missingCosts = completeTotal ? [] : [
    ...(offer.shipping_known === true ? [] : ["shipping"]),
    ...(offer.taxes_known === true ? [] : ["taxes"]),
    ...(offer.availability === "unknown" ? ["availability"] : []),
    "final checkout total",
  ];
  return { price, completeTotal, target, percentage, newCheaper, reason, missingCosts: [...new Set(missingCosts)] };
}

export function isBackInStockAlert(item: AlertItem, offer: AlertOffer, previousAvailability: string | null, now = Date.now()): boolean {
  if (offer.is_verified !== true) return false;
  if (!item.alert_on_back_in_stock || previousAvailability !== "out_of_stock") return false;
  if (Number(offer.product_match_confidence || 0) < 0.9 || offer.availability !== "in_stock") return false;
  if (compareProductConditions(item.condition, offer.condition) !== "exact") return false;
  const checked = Date.parse(offer.last_verified_at || "");
  return Number.isFinite(checked) && now - checked <= 24 * 60 * 60 * 1000;
}

export function getAlertDeduplicationKey(itemId: string, offer: AlertOffer, observation: { price: number; reason: string }) {
  return `${itemId}:${offer.id}:${offer.currency}:${observation.price}:${observation.reason}`;
}
