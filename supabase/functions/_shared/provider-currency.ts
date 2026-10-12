const currencyCodes = [
  "USD", "EUR", "GBP", "MAD", "CAD", "AUD", "JPY", "CHF", "AED", "SAR", "CNY", "INR", "SEK", "NOK", "DKK", "PLN",
] as const;

const hasCode = (text: string, code: string) => new RegExp(`\\b${code}\\b`, "i").test(text);

/** Resolve explicit provider currency evidence; ambiguous symbols only use a compatible market fallback. */
export function resolveProviderCurrency(value: unknown, fallbackCurrency: string): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  const fallback = fallbackCurrency.trim().toUpperCase();
  const marketCurrency = currencyCodes.includes(fallback as (typeof currencyCodes)[number]) ? fallback : null;
  if (!text) return marketCurrency;

  for (const code of currencyCodes) {
    if (hasCode(text, code)) return code;
  }
  if (/\bUS\s*\$/i.test(text)) return "USD";
  if (/\b(?:CA\s*\$|C\$)/i.test(text)) return "CAD";
  if (/\b(?:AU\s*\$|A\$)/i.test(text)) return "AUD";
  if (/CN¥|元/i.test(text)) return "CNY";
  if (/JP¥/i.test(text)) return "JPY";
  if (/€/.test(text)) return "EUR";
  if (/£/.test(text)) return "GBP";
  if (/د\.م\.?/i.test(text)) return "MAD";
  if (/₹/.test(text)) return "INR";
  if (/¥/.test(text)) return marketCurrency && ["JPY", "CNY"].includes(marketCurrency) ? marketCurrency : null;
  if (/\$/.test(text)) return marketCurrency && ["USD", "CAD", "AUD"].includes(marketCurrency) ? marketCurrency : null;
  return marketCurrency;
}
