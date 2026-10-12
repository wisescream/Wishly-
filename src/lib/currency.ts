export type Currency =
  | "USD"
  | "EUR"
  | "GBP"
  | "MAD"
  | "CAD"
  | "JPY"
  | "AUD"
  | "CHF"
  | "AED"
  | "SAR"
  | "CNY";

export interface CurrencyConfig {
  code: Currency;
  symbol: string;
  name: string;
  locale: string;
  flag: string;
}

export const CURRENCIES: Record<Currency, CurrencyConfig> = {
  USD: { code: "USD", symbol: "$", name: "US Dollar", locale: "en-US", flag: "🇺🇸" },
  EUR: { code: "EUR", symbol: "€", name: "Euro", locale: "de-DE", flag: "🇪🇺" },
  GBP: { code: "GBP", symbol: "£", name: "British Pound", locale: "en-GB", flag: "🇬🇧" },
  MAD: { code: "MAD", symbol: "د.م.", name: "Moroccan Dirham", locale: "ar-MA", flag: "🇲🇦" },
  CAD: { code: "CAD", symbol: "CA$", name: "Canadian Dollar", locale: "en-CA", flag: "🇨🇦" },
  JPY: { code: "JPY", symbol: "¥", name: "Japanese Yen", locale: "ja-JP", flag: "🇯🇵" },
  AUD: { code: "AUD", symbol: "AU$", name: "Australian Dollar", locale: "en-AU", flag: "🇦🇺" },
  CHF: { code: "CHF", symbol: "CHF", name: "Swiss Franc", locale: "de-CH", flag: "🇨🇭" },
  AED: { code: "AED", symbol: "د.إ", name: "UAE Dirham", locale: "ar-AE", flag: "🇦🇪" },
  SAR: { code: "SAR", symbol: "﷼", name: "Saudi Riyal", locale: "ar-SA", flag: "🇸🇦" },
  CNY: { code: "CNY", symbol: "¥", name: "Chinese Yuan", locale: "zh-CN", flag: "🇨🇳" },
};

export function isSupportedCurrency(value: string | null | undefined): value is Currency {
  return typeof value === "string" && value === value.toUpperCase() && Object.prototype.hasOwnProperty.call(CURRENCIES, value);
}

// Base exchange rates relative to USD (Last updated benchmark: 2026-10)
export const USD_EXCHANGE_RATES: Record<Currency, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  MAD: 10.05,
  CAD: 1.36,
  JPY: 152.4,
  AUD: 1.51,
  CHF: 0.88,
  AED: 3.67,
  SAR: 3.75,
  CNY: 7.24,
};

export const EXCHANGE_RATE_TIMESTAMP = "2026-10-10T00:00:00Z";

export interface ConvertedPrice {
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number;
  targetCurrency: Currency;
  rate: number;
  rateTimestamp: string;
  isEstimate: boolean;
}

/**
 * Normalizes an arbitrary currency string (e.g. '$', 'eur', 'usd', 'MAD', '£') to standard Currency
 */
export function normalizeCurrency(input?: string | null): Currency {
  if (!input) return "USD";
  const upper = input.trim().toUpperCase();
  if (upper in CURRENCIES) return upper as Currency;
  if (upper === "$" || upper === "US$" || upper === "USD") return "USD";
  if (upper === "€" || upper === "EUR") return "EUR";
  if (upper === "£" || upper === "GBP") return "GBP";
  if (upper === "DH" || upper === "DHS" || upper === "MAD" || upper === "د.م.") return "MAD";
  if (upper === "C$" || upper === "CAD") return "CAD";
  if (upper === "¥" || upper === "JPY") return "JPY";
  if (upper === "A$" || upper === "AUD") return "AUD";
  return "USD";
}

/**
 * Converts any supported currency to target currency with full traceability
 */
export function convertCurrency(
  amount: number,
  fromRaw: string,
  toRaw: string
): ConvertedPrice {
  const from = normalizeCurrency(fromRaw);
  const to = normalizeCurrency(toRaw);

  if (from === to) {
    return {
      originalAmount: amount,
      originalCurrency: from,
      convertedAmount: amount,
      targetCurrency: to,
      rate: 1.0,
      rateTimestamp: EXCHANGE_RATE_TIMESTAMP,
      isEstimate: false,
    };
  }

  // Convert via USD anchor
  const amountInUSD = amount / USD_EXCHANGE_RATES[from];
  const converted = amountInUSD * USD_EXCHANGE_RATES[to];
  const effectiveRate = USD_EXCHANGE_RATES[to] / USD_EXCHANGE_RATES[from];

  return {
    originalAmount: amount,
    originalCurrency: from,
    convertedAmount: Number(converted.toFixed(2)),
    targetCurrency: to,
    rate: Number(effectiveRate.toFixed(4)),
    rateTimestamp: EXCHANGE_RATE_TIMESTAMP,
    isEstimate: true,
  };
}

/**
 * Formats price in standard locale with currency symbol
 */
export function formatPrice(amount: number | null | undefined, currencyRaw: string = "USD"): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return "—";
  }

  const rawCode = currencyRaw.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(rawCode) && !isSupportedCurrency(rawCode)) {
    return `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} ${rawCode}`;
  }

  const currency = normalizeCurrency(currencyRaw);
  const config = CURRENCIES[currency] || CURRENCIES.USD;

  try {
    return new Intl.NumberFormat(config.locale, {
      style: "currency",
      currency: config.code,
      minimumFractionDigits: config.code === "JPY" ? 0 : 2,
      maximumFractionDigits: config.code === "JPY" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${config.symbol}${amount.toFixed(2)}`;
  }
}

export const DEFAULT_CURRENCY: Currency = "MAD";
