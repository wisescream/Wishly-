export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number | null;
}

export interface TavilySearchResponse {
  results: TavilyResult[];
  answer: string | null;
  error: string | null;
}

export function buildRetailerQueries(input: {
  title: string;
  brand?: string | null;
  model?: string | null;
  sku?: string | null;
  gtin?: string | null;
  variant?: string | null;
  category?: string | null;
  country?: string | null;
  language?: string | null;
}): string[] {
  const clean = (value: string | null | undefined) => String(value || "").replace(/[\r\n"]/g, " ").replace(/\s+/g, " ").trim();
  const product = [input.brand, input.model, input.title, input.variant].map(clean).filter(Boolean).join(" ").slice(0, 150).trim();
  if (!product) return [];
  const category = clean(input.category) || "fashion clothing shoes";
  const country = String(input.country || "").toUpperCase();
  const languageByCountry: Record<string, string> = { MA: "fr", FR: "fr", ES: "es", PT: "pt", IT: "it", DE: "de", NL: "nl", BE: "fr", GB: "en", TR: "tr", US: "en", CA: "en" };
  const language = String(input.language || languageByCountry[country] || "en").toLowerCase().split("-")[0];
  const retailerWords: Record<string, string> = {
    fr: "vêtements chaussures boutique prix mode",
    es: "ropa zapatos tienda precio moda",
    pt: "roupa sapatos loja preço moda",
    de: "Kleidung Schuhe Modegeschäft Preis",
    it: "abbigliamento scarpe negozio prezzo moda",
    nl: "kleding schoenen modewinkel",
    tr: "giyim ayakkabı mağaza fiyat moda",
    ar: "ملابس أحذية متجر أزياء سعر",
    en: "clothing shoes fashion retailer",
  };
  const countryName: Record<string, string> = {
    MA: "Morocco Maroc المغرب", FR: "France", ES: "Spain España", PT: "Portugal", IT: "Italy Italia",
    DE: "Germany Deutschland", NL: "Netherlands Nederland", BE: "Belgium Belgique België", GB: "United Kingdom UK",
    TR: "Turkey Türkiye", US: "United States", CA: "Canada", AU: "Australia", JP: "Japan 日本", CN: "China 中国",
    SE: "Sweden Sverige", NO: "Norway Norge", DK: "Denmark Danmark", BR: "Brazil Brasil",
  };
  const localizedMarket = countryName[country] || country;
  const nearbyMarkets: Record<string, Array<[string, string]>> = {
    MA: [["FR", "fr"], ["ES", "es"]], FR: [["ES", "es"], ["IT", "it"]], ES: [["PT", "pt"], ["FR", "fr"]],
    PT: [["ES", "es"], ["FR", "fr"]], IT: [["FR", "fr"], ["DE", "de"]], DE: [["NL", "nl"], ["FR", "fr"]],
    NL: [["DE", "de"], ["BE", "nl"]], BE: [["FR", "fr"], ["NL", "nl"]], GB: [["FR", "fr"], ["DE", "de"]],
    TR: [["DE", "de"], ["FR", "fr"]], US: [["CA", "en"], ["GB", "en"]], CA: [["US", "en"], ["GB", "en"]],
    AU: [["GB", "en"], ["US", "en"]],
  };
  const alternatives = (nearbyMarkets[country] || [["GB", "en"], ["FR", "fr"]])
    .map(([code, locale]) => `${countryName[code]} ${retailerWords[locale]}`);
  const identifiers = [input.sku, input.gtin].map(clean).filter(Boolean).join(" ");
  const exactReference = [product, identifiers].filter(Boolean).join(" ");
  return [...new Set([
    `"${product}" ${identifiers} ${category} ${retailerWords[language] || retailerWords.en} ${localizedMarket}`.replace(/\s+/g, " ").trim(),
    `"${exactReference}" ${category} ${retailerWords[language] || retailerWords.en} online shop retailer ${localizedMarket}`.replace(/\s+/g, " ").trim(),
    `"${product}" ${category} independent boutique outlet discount resale second hand vintage marketplace ${alternatives.join(" ")}`.replace(/\s+/g, " ").trim(),
  ])].slice(0, 3);
}

export function parseTavilyResponse(value: unknown): TavilySearchResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { results: [], answer: null, error: "Invalid Tavily response." };
  const body = value as Record<string, unknown>;
  const rows = Array.isArray(body.results) ? body.results : [];
  const results = rows.flatMap((row): TavilyResult[] => {
    if (!row || typeof row !== "object") return [];
    const result = row as Record<string, unknown>;
    const title = typeof result.title === "string" ? result.title.trim().slice(0, 500) : "";
    const url = typeof result.url === "string" ? result.url.trim() : "";
    if (!title || !/^https?:\/\//i.test(url)) return [];
    const score = Number(result.score);
    return [{ title, url, content: typeof result.content === "string" ? result.content.slice(0, 5000) : "", score: Number.isFinite(score) ? score : null }];
  });
  return { results, answer: typeof body.answer === "string" ? body.answer.slice(0, 2000) : null, error: typeof body.error === "string" ? body.error.slice(0, 300) : null };
}

export async function searchTavily(
  apiKey: string,
  query: string,
  fetcher: typeof fetch = fetch,
  includeDomains: string[] = [],
): Promise<{ response: Response; data: TavilySearchResponse }> {
  const domains = [...new Set(includeDomains.map((domain) => domain.toLowerCase().replace(/^www\./, "")).filter((domain) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)))].slice(0, 20);
  const response = await fetcher("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, topic: "general", search_depth: "basic", max_results: 8, ...(domains.length ? { include_domains: domains } : {}), include_answer: false, include_raw_content: false }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return { response, data: { results: [], answer: null, error: `Tavily returned HTTP ${response.status}.` } };
  let payload: unknown;
  try { payload = await response.json(); }
  catch { return { response, data: { results: [], answer: null, error: "Tavily returned invalid JSON." } }; }
  return { response, data: parseTavilyResponse(payload) };
}
