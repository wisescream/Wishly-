export interface ShippingEstimate {
  known: boolean;
  amount: number;
  evidence: string | null;
}

function parseAmount(value: string): number | null {
  const raw = value.replace(/\s/g, "");
  const normalized = raw.includes(".") && raw.includes(",")
    ? raw.lastIndexOf(",") > raw.lastIndexOf(".") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "")
    : raw.replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function parseShippingEstimate(value: unknown, fallbackCurrency: string): ShippingEstimate {
  const evidence = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!evidence) return { known: false, amount: 0, evidence: null };
  if (/\b(?:over|orders? over|minimum|when you spend|spend at least)\b/i.test(evidence)) {
    return { known: false, amount: 0, evidence };
  }
  if (/\bfree\s+(?:shipping|delivery)\b/i.test(evidence)) return { known: true, amount: 0, evidence };

  const match = evidence.match(/(?:USD|EUR|GBP|MAD|CAD|AUD|JPY|CHF|AED|SAR|CNY|INR|US\s*\$|CA\s*\$|AU\s*\$|CN¥|JP¥|\$|€|£|¥|₹|د\.م\.?|C\$|A\$)\s*([\d][\d., ]{0,14})|([\d][\d., ]{0,14})\s*(USD|EUR|GBP|MAD|CAD|AUD|JPY|CHF|AED|SAR|CNY|INR)/i);
  if (!match) return { known: false, amount: 0, evidence };
  const currency = resolveProviderCurrency(match[0], fallbackCurrency);
  const amount = parseAmount(match[1] || match[2] || "");
  if (!currency || currency !== fallbackCurrency || amount == null) return { known: false, amount: 0, evidence };
  return { known: true, amount, evidence };
}

export function calculateTotalPurchaseCost(input: {
  price: number;
  shippingCost: number;
  taxes: number;
  shippingKnown: boolean;
  taxesKnown: boolean;
}): number | null {
  const { price, shippingCost, taxes, shippingKnown, taxesKnown } = input;
  if (!Number.isFinite(price) || price <= 0 || !shippingKnown || !taxesKnown) return null;
  if (!Number.isFinite(shippingCost) || shippingCost < 0 || !Number.isFinite(taxes) || taxes < 0) return null;
  return Math.round((price + shippingCost + taxes + Number.EPSILON) * 100) / 100;
}

export function convertAmount(amount: number, rate: number): number | null {
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(rate) || rate <= 0) return null;
  return Math.round((amount * rate + Number.EPSILON) * 100) / 100;
}
import { resolveProviderCurrency } from "./provider-currency.ts";

