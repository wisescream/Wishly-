import type { Item, ProductCandidate, StyleProfile } from '@/types/database';

export type DiscoverySearch = {
  query: string;
  reason: string;
  category: string;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const words = (value: string) => value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
const compact = (parts: Array<string | null | undefined>) => [...new Set(parts.map((part) => part?.trim()).filter(Boolean))].join(' ').slice(0, 180);
const isFashionCategory = (category: string) => /\b(?:clothing|apparel|fashion|shoes?|footwear|sneakers?|boots?|tops?|shirts?|blouses?|sweaters?|hoodies|jackets?|coats?|dresses|bottoms?|jeans?|trousers?|pants|skirts?|sportswear|activewear)\b/i.test(category);

export function inferProductCategory(item: Pick<Item, 'title' | 'category'>): string {
  if (item.category?.trim()) return item.category.trim();
  const title = item.title.toLowerCase();
  const categories: Array<[RegExp, string]> = [
    [/headphone|earbud|headset/, 'headphones'], [/sneaker|shoe|boot|trainer/, 'shoes'],
    [/dress|blouse|shirt|hoodie|sweater|jacket|coat|jean|trouser|skirt/, 'clothing'],
    [/phone|iphone|smartphone/, 'smartphones'], [/laptop|notebook/, 'laptops'],
    [/camera|lens/, 'cameras'], [/watch|smartwatch/, 'watches'],
    [/perfume|fragrance/, 'fragrance'], [/bag|backpack|handbag/, 'bags'],
    [/book|novel/, 'books'], [/chair|sofa|lamp|table/, 'home'],
  ];
  return categories.find(([pattern]) => pattern.test(title))?.[1] || '';
}

function preferredSize(profile: StyleProfile, category: string): string {
  const clothing = asRecord(profile.apparel_sizes);
  const categoryKeys = /shoe|footwear|sneaker|boot/i.test(category)
    ? []
    : /bottom|jean|trouser|pant|skirt/i.test(category) ? ['bottoms']
      : /dress/i.test(category) ? ['dresses']
        : /jacket|coat|outerwear|blazer/i.test(category) ? ['outerwear']
          : /sport|activewear/i.test(category) ? ['sportswear'] : ['tops'];
  if (/shoe|footwear|sneaker|boot/i.test(category)) {
    const shoe = asRecord(profile.shoe_sizes);
    const preferred = asRecord(shoe.preferred);
    const actual = asRecord(shoe.actual);
    return String(preferred.value || actual.value || profile.shoe_size || '').trim();
  }
  for (const key of categoryKeys) {
    const entry = asRecord(clothing[key]);
    const size = String(entry.preferred || entry.actual || '').trim();
    if (size) return size;
  }
  return '';
}

function contextText(profile: StyleProfile | null): string {
  if (profile?.sizing_context === 'mens') return "men's";
  if (profile?.sizing_context === 'womens') return "women's";
  return '';
}

export function buildPersonalizedSearches(items: Item[], profile: StyleProfile | null): DiscoverySearch[] {
  const searches: DiscoverySearch[] = [];
  const context = contextText(profile);
  const style = profile?.style_tags?.slice(0, 2).join(' ') || '';
  const preferredBrands = profile?.brands?.slice(0, 2) || [];

  // Use saved wishlist brands and categories as explicit relevance signals.
  for (const item of items.slice(0, 3)) {
    const category = inferProductCategory(item);
    if (!category && !item.brand) continue;
    const size = profile && isFashionCategory(category) ? preferredSize(profile, category) : '';
    const query = compact([context, item.brand, category, style, size ? `size ${size}` : '']);
    if (query) searches.push({ query, category, reason: item.brand || category ? `Related to ${item.title}` : 'Based on your wishlist' });
  }

  if (profile) {
    const apparelSize = preferredSize(profile, 'tops');
    const shoeSize = preferredSize(profile, 'footwear');
    for (const [category, size] of [['clothing', apparelSize], ['shoes', shoeSize]]) {
      if (!size && !style && preferredBrands.length === 0) continue;
      const query = compact([context, preferredBrands[0], style, category, size ? `size ${size}` : '']);
      if (query) searches.push({ query, category, reason: 'Based on your style and size preferences' });
    }
  }

  const unique = new Map<string, DiscoverySearch>();
  for (const search of searches) {
    const key = search.query.toLocaleLowerCase();
    if (!unique.has(key)) unique.set(key, search);
  }
  return [...unique.values()].slice(0, 4);
}

function explicitSizeInTitle(candidate: ProductCandidate, profile: StyleProfile | null, category: string): string | null {
  if (!profile) return null;
  const wanted = preferredSize(profile, category);
  if (!wanted) return null;
  const title = candidate.title;
  const variants = candidate.variants || [];
  const variantMatch = variants.some((variant) => variant.size?.trim().toLocaleLowerCase() === wanted.toLocaleLowerCase());
  if (variantMatch) return wanted;
  // A size is called out only when the listing itself labels it. A search query
  // containing a size is not evidence that the retailer has that variant.
  const escaped = wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sizeLabel = new RegExp(`\\b(?:size|EU|UK|US(?:\\s+(?:men|women))?)\\s*[:#-]?\\s*${escaped}\\b`, 'i');
  return sizeLabel.test(title) ? wanted : null;
}

export function rankPersonalizedCandidates(
  results: Array<{ candidate: ProductCandidate; search: DiscoverySearch }>,
  items: Item[],
  profile: StyleProfile | null,
) {
  const savedTitles = new Set(items.map((item) => words(item.title).join(' ')).filter(Boolean));
  const seen = new Set<string>();
  return results.flatMap(({ candidate, search }) => {
    const titleKey = words(candidate.title).join(' ');
    if (!titleKey || savedTitles.has(titleKey)) return [];
    const key = (candidate.gtin || candidate.url || titleKey).toLocaleLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    const preferredSize = explicitSizeInTitle(candidate, profile, search.category);
    const title = candidate.title.toLocaleLowerCase();
    const brandMatch = Boolean(profile?.brands?.some((brand) => brand && title.includes(brand.toLocaleLowerCase())));
    const styleMatch = Boolean(profile?.style_tags?.some((tag) => tag && title.includes(tag.toLocaleLowerCase())));
    const score = (preferredSize ? 4 : 0) + (brandMatch ? 2 : 0) + (styleMatch ? 1 : 0) + (candidate.price && candidate.price > 0 ? 0.25 : 0);
    return [{ candidate, reason: search.reason, category: search.category, preferredSize, score }];
  }).sort((a, b) => b.score - a.score);
}
