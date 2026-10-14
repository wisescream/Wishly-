type Json = Record<string, unknown> | null | undefined;
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const normalized = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase().replace(/'s\b/g, "").replace(/\s+/g, " ");

function categoryKey(category: string): string {
  const lower = category.toLowerCase();
  if (/jean|trouser|pant|short|legging|skirt|bottom/.test(lower)) return "bottoms";
  if (/dress/.test(lower)) return "dresses";
  if (/jacket|coat|outerwear|blazer|suit/.test(lower)) return "outerwear";
  if (/sport|activewear|athletic/.test(lower)) return "sportswear";
  if (/underwear|swimwear|lingerie/.test(lower)) return "underwear";
  return "tops";
}

export function hasPreferredOfferSize(profile: Json, category: string | null | undefined): boolean {
  if (!profile || !category || /^(fashion|clothing|apparel|accessories)$/i.test(category.trim())) return false;
  const footwear = /shoe|footwear|sneaker|boot/i.test(category);
  const sizes = record(footwear ? profile.shoe_sizes : profile.apparel_sizes);
  const entry = footwear ? sizes : record(sizes[category] ?? sizes[category.toLowerCase()] ?? sizes[categoryKey(category)]);
  const preferred = footwear ? record(entry.preferred).value : entry.preferred;
  const actual = footwear ? record(entry.actual).value : entry.actual;
  return Boolean(normalized(preferred) || normalized(actual));
}

export function matchesPreferredOfferSize(
  profile: Json,
  category: string | null | undefined,
  offerSize: string | null | undefined,
  offerSystem?: string | null,
): boolean {
  if (!hasPreferredOfferSize(profile, category)) return true;
  if (!category || !offerSize || !profile) return false;
  const footwear = /shoe|footwear|sneaker|boot/i.test(category);
  const sizes = record(footwear ? profile.shoe_sizes : profile.apparel_sizes);
  const entry = footwear ? sizes : record(sizes[category] ?? sizes[category.toLowerCase()] ?? sizes[categoryKey(category)]);
  const preferredEntry = footwear ? record(entry.preferred) : entry;
  const actualEntry = footwear ? record(entry.actual) : entry;
  const preferred = normalized(footwear ? preferredEntry.value : entry.preferred);
  const actual = normalized(footwear ? actualEntry.value : entry.actual);
  const preferredSystem = normalized(footwear ? preferredEntry.system ?? actualEntry.system : entry.system);
  const candidate = normalized(offerSize);
  const candidateSystem = normalized(offerSystem);
  if (candidate !== preferred && candidate !== actual) return false;
  if (footwear && (!candidateSystem || !preferredSystem)) return false;
  return !candidateSystem || !preferredSystem || candidateSystem === preferredSystem;
}
