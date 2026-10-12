export interface ParsedShipping {
  cost: number;
  known: boolean;
  evidence?: string;
}

function shippingCurrency(evidence: string, fallback: string): string | null {
  const normalized = fallback.toUpperCase();
  const supported = ["USD", "EUR", "GBP", "MAD", "CAD", "AUD", "JPY", "CHF", "AED", "SAR", "CNY", "INR", "SEK", "NOK", "DKK", "PLN"].includes(normalized);
  const marketCurrency = supported ? normalized : null;
  const code = evidence.match(/\b(USD|EUR|GBP|MAD|CAD|AUD|JPY|CHF|AED|SAR|CNY|INR|SEK|NOK|DKK|PLN)\b/i)?.[1]?.toUpperCase();
  if (code) return code;
  if (/\bUS\s*\$/i.test(evidence)) return "USD";
  if (/\b(?:CA\s*\$|C\$)/i.test(evidence)) return "CAD";
  if (/\b(?:AU\s*\$|A\$)/i.test(evidence)) return "AUD";
  if (/CN¥|元/i.test(evidence)) return "CNY";
  if (/JP¥/i.test(evidence)) return "JPY";
  if (/€/.test(evidence)) return "EUR";
  if (/£/.test(evidence)) return "GBP";
  if (/د\.م\.?/i.test(evidence)) return "MAD";
  if (/₹/.test(evidence)) return "INR";
  if (/¥/.test(evidence)) return marketCurrency && ["JPY", "CNY"].includes(marketCurrency) ? marketCurrency : null;
  if (/\$/.test(evidence)) return marketCurrency && ["USD", "CAD", "AUD"].includes(marketCurrency) ? marketCurrency : null;
  return marketCurrency;
}

export function parseProviderShipping(value: unknown, currency: string): ParsedShipping {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0
      ? { cost: value, known: true, evidence: String(value) }
      : { cost: 0, known: false };
  }
  if (typeof value !== "string" || !value.trim()) return { cost: 0, known: false };
  const evidence = value.trim().replace(/\s+/g, " ");
  if (/\b(?:over|orders? over|minimum|when you spend|spend at least)\b/i.test(evidence)) return { cost: 0, known: false, evidence };
  if (/\bfree\s+(?:shipping|delivery)\b/i.test(evidence)) return { cost: 0, known: true, evidence };
  const resolvedCurrency = shippingCurrency(evidence, currency);
  if (!resolvedCurrency || resolvedCurrency !== currency.toUpperCase()) return { cost: 0, known: false, evidence };
  const raw = evidence.replace(/[^\d.,-]/g, "");
  if (!raw || !/\d/.test(raw)) return { cost: 0, known: false, evidence };
  const normalized = raw.includes(".") && raw.includes(",")
    ? raw.lastIndexOf(",") > raw.lastIndexOf(".") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "")
    : raw.replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "");
  const cost = Number(normalized);
  return Number.isFinite(cost) && cost >= 0 ? { cost, known: true, evidence } : { cost: 0, known: false, evidence };
}
