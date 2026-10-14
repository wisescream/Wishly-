export interface ProductSearchIdentity {
  brand?: unknown;
  modelNumber?: unknown;
  gtin?: unknown;
  title?: unknown;
  variant?: unknown;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function includesPhrase(text: string, phrase: string): boolean {
  if (!text || !phrase) return false;
  return ` ${text.toLocaleLowerCase()} `.includes(` ${phrase.toLocaleLowerCase()} `);
}

/** Build a small, provider-neutral query set from strongest identity evidence to broadest. */
export function buildProductSearchQueries(identity: ProductSearchIdentity, maxQueries = 3): string[] {
  const brand = clean(identity.brand);
  const model = clean(identity.modelNumber);
  const gtin = clean(identity.gtin);
  const title = clean(identity.title);
  const variant = clean(identity.variant);
  const candidates: string[] = [];

  if (gtin) candidates.push(`"${gtin.replace(/["\\]/g, "")}"`);
  if (model) candidates.push([brand, model].filter(Boolean).join(" "));

  // Titles commonly already contain the brand and model. Avoid wasting query
  // budget by repeating those words, but retain the full title and variant.
  const titleParts = [
    includesPhrase(title, brand) ? "" : brand,
    title,
    includesPhrase(title, model) ? "" : model,
    includesPhrase(title, variant) ? "" : variant,
  ].filter(Boolean);
  if (titleParts.length) candidates.push(titleParts.join(" "));

  const seen = new Set<string>();
  const limit = Number.isFinite(maxQueries) ? Math.max(0, Math.min(10, Math.floor(maxQueries))) : 3;
  return candidates.flatMap((candidate) => {
    const query = candidate.replace(/\s+/g, " ").trim().slice(0, 240);
    const key = query.toLocaleLowerCase().replace(/["']/g, "").replace(/\s+/g, " ").trim();
    if (!query || seen.has(key)) return [];
    seen.add(key);
    return [query];
  }).slice(0, limit);
}

/** Preserve identifier searches while adding one localized market query for Moroccan discovery. */
export function buildMarketProductSearchQueries(identity: ProductSearchIdentity, country: string | null | undefined, maxQueries = 3): string[] {
  const base = buildProductSearchQueries(identity, 3);
  if (String(country || "").toUpperCase() !== "MA" || !base.length) return base.slice(0, maxQueries);
  const titleIdentity = [identity.brand, identity.title, identity.modelNumber, identity.variant]
    .filter((value): value is string => typeof value === "string" && value.trim())
    .join(" ").replace(/\s+/g, " ").trim();
  const localized = titleIdentity ? `${titleIdentity.slice(0, 195)} Maroc Morocco prix boutique en ligne`.slice(0, 240) : "";
  const ordered = [...new Set([base[0], localized, ...base.slice(1, -1)].filter(Boolean))];
  return ordered.slice(0, Math.max(0, Math.min(10, Math.floor(maxQueries))));
}
