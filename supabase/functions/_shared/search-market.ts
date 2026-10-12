const countryMarkets: Record<string, { gl: string; hl: string; currency: string }> = {
  MA: { gl: "ma", hl: "fr", currency: "MAD" }, US: { gl: "us", hl: "en", currency: "USD" }, GB: { gl: "gb", hl: "en", currency: "GBP" },
  CA: { gl: "ca", hl: "en", currency: "CAD" }, AU: { gl: "au", hl: "en", currency: "AUD" }, JP: { gl: "jp", hl: "ja", currency: "JPY" },
  FR: { gl: "fr", hl: "fr", currency: "EUR" }, DE: { gl: "de", hl: "de", currency: "EUR" }, CH: { gl: "ch", hl: "de", currency: "CHF" },
  IN: { gl: "in", hl: "en", currency: "INR" }, CN: { gl: "cn", hl: "zh-CN", currency: "CNY" }, AE: { gl: "ae", hl: "en", currency: "AED" },
};
const supportedCurrencies = new Set(["USD", "EUR", "GBP", "MAD", "CAD", "AUD", "JPY", "CHF", "AED", "SAR", "CNY", "INR", "SEK", "NOK", "DKK", "PLN"]);

export interface SearchMarket {
  country: string;
  gl: string;
  hl: string;
  currency: string;
}

export function resolveSearchMarket(countryValue: unknown, currencyValue: unknown, languageValue: unknown): SearchMarket {
  const country = typeof countryValue === "string" ? countryValue.trim().toUpperCase() : "";
  const preferredCurrency = typeof currencyValue === "string" ? currencyValue.trim().toUpperCase() : "";
  const preferredLanguage = typeof languageValue === "string" ? languageValue.trim() : "";
  const known = countryMarkets[country];
  const language = /^[a-z]{2}(?:-[A-Z]{2})?$/.test(preferredLanguage) ? preferredLanguage : known?.hl || "en";
  return {
    country: /^[A-Z]{2}$/.test(country) ? country : "US",
    gl: known?.gl || (/^[A-Z]{2}$/.test(country) ? country.toLowerCase() : "us"),
    hl: language,
    currency: supportedCurrencies.has(preferredCurrency) ? preferredCurrency : known?.currency || "USD",
  };
}
