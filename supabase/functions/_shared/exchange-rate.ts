import { convertAmount } from "./offer-cost.ts";

export interface ExchangeRate {
  base: string;
  quote: string;
  rate: number;
  date: string;
  source: "frankfurter";
}

export function parseExchangeRate(value: unknown, base: string, quote: string): ExchangeRate | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const normalizedBase = base.toUpperCase();
  const normalizedQuote = quote.toUpperCase();
  if (data.base !== normalizedBase || data.quote !== normalizedQuote || typeof data.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) return null;
  const parsedDate = new Date(`${data.date}T00:00:00Z`);
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== data.date) return null;
  if (typeof data.rate !== "number" || !Number.isFinite(data.rate) || data.rate <= 0) return null;
  return { base: normalizedBase, quote: normalizedQuote, rate: data.rate, date: data.date, source: "frankfurter" };
}

const cache = new Map<string, { rate: ExchangeRate; fetchedAt: number }>();
const cacheTtlMs = 12 * 60 * 60 * 1000;

export async function getExchangeRate(base: string, quote: string): Promise<ExchangeRate | null> {
  const normalizedBase = base.toUpperCase();
  const normalizedQuote = quote.toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedBase) || !/^[A-Z]{3}$/.test(normalizedQuote)) return null;
  if (normalizedBase === normalizedQuote) return null;
  const key = `${normalizedBase}:${normalizedQuote}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < cacheTtlMs) return cached.rate;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://api.frankfurter.dev/v2/rate/${normalizedBase}/${normalizedQuote}`, { signal: controller.signal });
    if (!response.ok) return null;
    const rate = parseExchangeRate(await response.json(), normalizedBase, normalizedQuote);
    if (rate) {
      cache.set(key, { rate, fetchedAt: Date.now() });
      if (cache.size > 500) cache.delete(cache.keys().next().value!);
    }
    return rate;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export interface ConvertibleOffer {
  price: number;
  total_price: number | null;
  total_is_estimated: boolean;
  currency: string;
}

export async function addOfferCurrencyConversions<T extends ConvertibleOffer>(offers: T[], targetCurrency: string): Promise<Array<T & {
  currency_converted_to: string | null;
  converted_price: number | null;
  converted_total_price: number | null;
  exchange_rate: number | null;
  exchange_rate_at: string | null;
  exchange_rate_source: string | null;
}>> {
  const target = targetCurrency.toUpperCase();
  const rates = new Map<string, ExchangeRate | null>();
  await Promise.all([...new Set(offers.map((offer) => offer.currency.toUpperCase()))].map(async (currency) => {
    rates.set(currency, currency === target ? null : await getExchangeRate(currency, target));
  }));
  return offers.map((offer) => {
    const currency = offer.currency.toUpperCase();
    if (currency === target) return {
      ...offer, currency_converted_to: target, converted_price: offer.price,
      converted_total_price: offer.total_price != null && !offer.total_is_estimated ? offer.total_price : null,
      exchange_rate: 1, exchange_rate_at: new Date().toISOString(), exchange_rate_source: "identity",
    };
    const rate = rates.get(currency);
    if (!rate) return {
      ...offer, currency_converted_to: null, converted_price: null,
      converted_total_price: null, exchange_rate: null, exchange_rate_at: null, exchange_rate_source: null,
    };
    return {
      ...offer, currency_converted_to: target,
      converted_price: convertAmount(Number(offer.price), rate.rate),
      converted_total_price: offer.total_price != null && !offer.total_is_estimated ? convertAmount(Number(offer.total_price), rate.rate) : null,
      exchange_rate: rate.rate, exchange_rate_at: `${rate.date}T00:00:00.000Z`, exchange_rate_source: rate.source,
    };
  });
}
