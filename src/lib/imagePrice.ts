export interface ImagePriceObservation {
  amount: number | null;
  currency: string | null;
  currencyAmbiguous: boolean;
}

const amountPattern = String.raw`([\d][\d., ]{0,14})`;
const supportedCodes = "USD|EUR|GBP|MAD|CAD|JPY|AUD|CHF|AED|SAR|CNY";
const currencyPattern = String.raw`(US\s*\$|CA\s*\$|C\$|AU\s*\$|A\$|${supportedCodes}|\$|€|£|¥|د\.م\.?|د\.إ\.?)`;

function parseAmount(raw: string): number | null {
  let normalized = raw.replace(/\s/g, "");
  const lastDot = normalized.lastIndexOf(".");
  const lastComma = normalized.lastIndexOf(",");

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSeparator = lastDot > lastComma ? "." : ",";
    const thousandsSeparator = decimalSeparator === "." ? "," : ".";
    normalized = normalized.split(thousandsSeparator).join("");
    if (decimalSeparator === ",") normalized = normalized.replace(",", ".");
  } else if (lastDot >= 0 || lastComma >= 0) {
    const separator = lastDot >= 0 ? "." : ",";
    const parts = normalized.split(separator);
    const trailingDigits = parts[parts.length - 1].length;
    if (parts.length > 2 || trailingDigits === 3) normalized = parts.join("");
    else normalized = parts.slice(0, -1).join("") + "." + parts[parts.length - 1];
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function currencyCode(marker: string): string | null {
  const value = marker.toUpperCase().replace(/\s/g, "");
  if (value === "€") return "EUR";
  if (value === "£") return "GBP";
  if (value === "د.م" || value === "د.م." || value === "د.إ" || value === "د.إ.") return value.startsWith("د.م") ? "MAD" : "AED";
  if (value === "US$" || value === "USD") return "USD";
  if (value === "CA$" || value === "C$" || value === "CAD") return "CAD";
  if (value === "AU$" || value === "A$" || value === "AUD") return "AUD";
  if (value === "¥") return null;
  if (value === "$" || value === "₹") return null;
  return supportedCodes.split("|").includes(value) ? value : null;
}

/** Parse one visible price only when its currency marker identifies a supported currency. */
export function parseImagePrice(text: string): ImagePriceObservation {
  const prefix = new RegExp(`${currencyPattern}\\s*${amountPattern}`, "i").exec(text);
  const suffixPattern = String.raw`(${supportedCodes}|€|£|¥|\$|د\.م\.?|د\.إ\.?)`;
  const suffix = new RegExp(`${amountPattern}\\s*${suffixPattern}`, "i").exec(text);
  const prefixIndex = prefix?.index ?? Number.POSITIVE_INFINITY;
  const suffixIndex = suffix?.index ?? Number.POSITIVE_INFINITY;
  const match = prefixIndex <= suffixIndex ? prefix : suffix;
  if (!match) return { amount: null, currency: null, currencyAmbiguous: false };

  const isPrefix = match === prefix;
  const rawAmount = isPrefix ? match[2] : match[1];
  const marker = isPrefix ? match[1] : match[2];
  const amount = parseAmount(rawAmount);
  if (!amount) return { amount: null, currency: null, currencyAmbiguous: false };

  const afterMatch = text.slice((match.index || 0) + match[0].length);
  const explicitSuffix = isPrefix ? new RegExp(`^\\s*\\b(${supportedCodes})\\b`, "i").exec(afterMatch) : null;
  const beforeMatch = text.slice(0, match.index || 0);
  const qualifiedDollar = isPrefix && marker === "$"
    ? /(US|CA|AU)\s*$/i.exec(beforeMatch)?.[1]?.toUpperCase()
    : null;
  const resolvedMarker = explicitSuffix?.[1] || (qualifiedDollar ? `${qualifiedDollar}$` : marker);
  const currency = currencyCode(resolvedMarker);
  return { amount: currency ? amount : null, currency, currencyAmbiguous: !currency };
}
