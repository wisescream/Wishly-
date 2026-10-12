export interface RetailerCitation {
  url: string;
  title: string;
  content: string;
}

export function extractRetailerCitations(annotations: unknown): RetailerCitation[] {
  if (!Array.isArray(annotations)) return [];
  const seen = new Set<string>();
  const citations: RetailerCitation[] = [];
  for (const annotation of annotations) {
    if (!annotation || typeof annotation !== "object") continue;
    const entry = annotation as Record<string, unknown>;
    if (entry.type !== "url_citation") continue;
    const citation = (entry.url_citation && typeof entry.url_citation === "object" ? entry.url_citation : entry) as Record<string, unknown>;
    if (typeof citation.url !== "string" || !isRetailerUrl(citation.url) || seen.has(citation.url)) continue;
    seen.add(citation.url);
    citations.push({
      url: citation.url,
      title: typeof citation.title === "string" ? citation.title.slice(0, 300) : "",
      content: typeof citation.content === "string" ? citation.content.slice(0, 5000) : "",
    });
  }
  return citations;
}

export function isRetailerUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return !/^(google|bing|yahoo|duckduckgo|facebook|instagram|tiktok|youtube|reddit|wikipedia|pinterest|tomsguide|techradar|cnet|theverge|wired|nytimes|forbes|engadget|digitaltrends)\./.test(host);
  } catch { return false; }
}

export function parseWebSnippetPrice(text: string, fallbackCurrency: string): { amount: number; currency: string } | null {
  const match = text.match(/(?:USD|EUR|GBP|MAD|CAD|AUD|JPY|CHF|AED|SAR|CNY|INR|US\s*\$|CA\s*\$|AU\s*\$|CN¥|JP¥|\$|€|£|¥|₹|د\.م\.?|C\$|A\$|元)\s*([\d][\d., ]{0,14})|([\d][\d., ]{0,14})\s*(USD|EUR|GBP|MAD|CAD|AUD|JPY|CHF|AED|SAR|CNY|INR)/i);
  if (!match) return null;
  const currency = resolveProviderCurrency(match[0], fallbackCurrency);
  if (!currency) return null;
  const raw = (match[1] || match[2] || "").replace(/\s/g, "");
  const normalized = raw.includes(".") && raw.includes(",")
    ? (raw.lastIndexOf(",") > raw.lastIndexOf(".") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, ""))
    : raw.replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? { amount, currency } : null;
}
import { resolveProviderCurrency } from "./provider-currency.ts";

