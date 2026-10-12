import { normalizeProductCondition, type ProductCondition } from "./productCondition";

export interface NotificationAlertDetails {
  itemId: string | null;
  offerUrl: string | null;
  variant: string | null;
  condition: ProductCondition | null;
  price: number | null;
  oldPrice: number | null;
  savings: number | null;
  currency: string | null;
  verifiedAt: string | null;
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Validate notification JSON before using it in links or user-facing price details. */
export function getNotificationAlertDetails(payload: unknown): NotificationAlertDetails {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { itemId: null, offerUrl: null, variant: null, condition: null, price: null, oldPrice: null, savings: null, currency: null, verifiedAt: null };
  }
  const details = payload as Record<string, unknown>;
  const itemId = typeof details.item_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(details.item_id)
    ? details.item_id
    : null;
  const verifiedAt = typeof details.verified_at === "string" && Number.isFinite(Date.parse(details.verified_at))
    ? details.verified_at
    : null;
  return {
    itemId,
    offerUrl: safeHttpUrl(details.url),
    variant: typeof details.variant === "string" && details.variant.trim() ? details.variant.trim().slice(0, 160) : null,
    condition: typeof details.condition === "string" ? normalizeProductCondition(details.condition) : null,
    price: positiveNumber(details.price),
    oldPrice: positiveNumber(details.old_price),
    savings: positiveNumber(details.savings),
    currency: typeof details.currency === "string" && /^[A-Z]{3}$/i.test(details.currency) ? details.currency.toUpperCase() : null,
    verifiedAt,
  };
}
