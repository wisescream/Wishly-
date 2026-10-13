const countryMarkets: Record<string, { gl: string; hl: string; currency: string }> = {
  // SerpApi's Google Shopping `gl` allowlist does not include Morocco. Keep
  // the user's actual country and MAD currency, but query the supported French
  // market until a Morocco Shopping market is available.
  MA: { gl: "fr", hl: "fr", currency: "MAD" }, US: { gl: "us", hl: "en", currency: "USD" }, GB: { gl: "gb", hl: "en", currency: "GBP" },
  CA: { gl: "ca", hl: "en", currency: "CAD" }, AU: { gl: "au", hl: "en", currency: "AUD" }, JP: { gl: "jp", hl: "ja", currency: "JPY" },
  FR: { gl: "fr", hl: "fr", currency: "EUR" }, DE: { gl: "de", hl: "de", currency: "EUR" }, CH: { gl: "ch", hl: "de", currency: "CHF" },
  IN: { gl: "in", hl: "en", currency: "INR" }, CN: { gl: "hk", hl: "zh-CN", currency: "CNY" }, AE: { gl: "ae", hl: "en", currency: "AED" },
};
const supportedCurrencies = new Set(["USD", "EUR", "GBP", "MAD", "CAD", "AUD", "JPY", "CHF", "AED", "SAR", "CNY", "INR", "SEK", "NOK", "DKK", "PLN"]);
const currencyMarkets: Record<string, { gl: string; hl: string }> = {
  USD: { gl: "us", hl: "en" }, EUR: { gl: "fr", hl: "fr" }, GBP: { gl: "gb", hl: "en" },
  MAD: { gl: "fr", hl: "fr" }, CAD: { gl: "ca", hl: "en" }, AUD: { gl: "au", hl: "en" },
  JPY: { gl: "jp", hl: "ja" }, CHF: { gl: "ch", hl: "de" }, AED: { gl: "ae", hl: "en" },
  SAR: { gl: "sa", hl: "ar" }, CNY: { gl: "hk", hl: "zh-CN" }, INR: { gl: "in", hl: "en" },
  SEK: { gl: "se", hl: "sv" }, NOK: { gl: "no", hl: "no" }, DKK: { gl: "dk", hl: "da" }, PLN: { gl: "pl", hl: "pl" },
};
const supportedShoppingGoogleCountries = new Set((
  "ai ar aw au at be bm br io ca ky cl cx cc co cz dk fk fi fr gf pf tf de gr gp hm hk hu in id ie il it jp kr my mq yt mx ms nl nc nz nf no ph pl pt re ro ru pm sa sg sk za gs es se ch tw th tk tr tc ua ae uk gb us vn vg wf"
).split(" "));

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
  const currencyMarket = currencyMarkets[preferredCurrency];
  const market = known || (supportedShoppingGoogleCountries.has(country.toLowerCase()) ? { gl: country.toLowerCase(), hl: "en" } : currencyMarket) || { gl: "us", hl: "en" };
  const language = /^[a-z]{2}(?:-[A-Z]{2})?$/.test(preferredLanguage) ? preferredLanguage : market.hl;
  return {
    country: /^[A-Z]{2}$/.test(country) ? country : "US",
    gl: market.gl,
    hl: language,
    currency: supportedCurrencies.has(preferredCurrency) ? preferredCurrency : known?.currency || "USD",
  };
}
