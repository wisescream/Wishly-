import type { StoreOffer, StyleProfile } from '@/types/database';

type JsonRecord = Record<string, unknown>;
const asRecord = (value: unknown): JsonRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
const norm = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase().replace(/'s\b/g, '').replace(/\s+/g, ' ');

export type SizeMatch = 'match' | 'possible' | 'no_match' | 'unknown';

export function hasPreferredSize(profile: StyleProfile | null | undefined, category: string | null | undefined): boolean {
  if (!profile || !category || /^(fashion|clothing|apparel|accessories)$/i.test(category.trim())) return false;
  const normalizedCategory = /shoe|footwear|sneaker|boot/i.test(category) ? 'footwear' : 'apparel';
  const sizes = normalizedCategory === 'footwear' ? asRecord(profile.shoe_sizes) : asRecord(profile.apparel_sizes);
  const categoryText = category.toLowerCase();
  const categoryKey = /jean|trouser|pant|short|legging|skirt|bottom/i.test(categoryText) ? 'bottoms'
    : /dress/i.test(categoryText) ? 'dresses'
      : /jacket|coat|outerwear|blazer|suit/i.test(categoryText) ? 'outerwear'
        : /sport|activewear|athletic/i.test(categoryText) ? 'sportswear'
          : /underwear|swimwear|lingerie/i.test(categoryText) ? 'underwear' : 'tops';
  const entry = normalizedCategory === 'footwear'
    ? sizes
    : asRecord(sizes[category] ?? sizes[category.toLowerCase()] ?? sizes[categoryKey]);
  const preferred = normalizedCategory === 'footwear' ? asRecord(entry.preferred).value : entry.preferred;
  const actual = normalizedCategory === 'footwear' ? asRecord(entry.actual).value : entry.actual;
  return Boolean(norm(preferred) || norm(actual));
}

export function getOfferSizeMatch(profile: StyleProfile | null | undefined, category: string | null | undefined, offerSize: string | null | undefined, offerSystem?: string | null): SizeMatch {
  if (!profile || !category || !offerSize) return 'unknown';
  const normalizedCategory = /shoe|footwear|sneaker|boot/i.test(category) ? 'footwear' : 'apparel';
  const sizes = normalizedCategory === 'footwear' ? asRecord(profile.shoe_sizes) : asRecord(profile.apparel_sizes);
  const categoryText = category.toLowerCase();
  const categoryKey = /jean|trouser|pant|short|legging|skirt|bottom/i.test(categoryText) ? 'bottoms'
    : /dress/i.test(categoryText) ? 'dresses'
      : /jacket|coat|outerwear|blazer|suit/i.test(categoryText) ? 'outerwear'
        : /sport|activewear|athletic/i.test(categoryText) ? 'sportswear'
          : /underwear|swimwear|lingerie/i.test(categoryText) ? 'underwear'
            : /top|shirt|blouse|sweater|hoodie|knit/i.test(categoryText) ? 'tops' : 'tops';
  const categoryEntry = normalizedCategory === 'footwear' ? sizes : asRecord(sizes[category] ?? sizes[category.toLowerCase()] ?? sizes[categoryKey]);
  const preferredValue = normalizedCategory === 'footwear' ? asRecord(categoryEntry.preferred).value : categoryEntry.preferred;
  const actualValue = normalizedCategory === 'footwear' ? asRecord(categoryEntry.actual).value : categoryEntry.actual;
  const preferred = norm(preferredValue);
  const actual = norm(actualValue);
  const preferredSystem = norm(normalizedCategory === 'footwear' ? asRecord(categoryEntry.preferred).system ?? asRecord(categoryEntry.actual).system : categoryEntry.system);
  const candidateSystem = norm(offerSystem);
  const alternatives = Array.isArray(categoryEntry.alternatives) ? categoryEntry.alternatives.map(norm) : [];
  const candidate = norm(offerSize);
  if (!preferred && !actual && !alternatives.length) return 'unknown';
  if (candidate === preferred || candidate === actual) {
    if (normalizedCategory === 'footwear' && (!candidateSystem || !preferredSystem)) return 'possible';
    if (candidateSystem && preferredSystem && candidateSystem !== preferredSystem) return 'no_match';
    return 'match';
  }
  if (alternatives.includes(candidate)) return 'possible';
  return 'no_match';
}

export function rankSizeAwareOffers<T extends StoreOffer>(offers: T[], profile: StyleProfile | null | undefined, category?: string | null): T[] {
  const rank: Record<SizeMatch, number> = { match: 0, possible: 1, unknown: 2, no_match: 3 };
  return [...offers].sort((a, b) => {
    const sizeA = rank[getOfferSizeMatch(profile, category, a.size_label, a.size_system)];
    const sizeB = rank[getOfferSizeMatch(profile, category, b.size_label, b.size_system)];
    if (sizeA !== sizeB) return sizeA - sizeB;
    const availableA = a.availability === 'in_stock' ? 0 : 1;
    const availableB = b.availability === 'in_stock' ? 0 : 1;
    if (availableA !== availableB) return availableA - availableB;
    const totalA = a.total_price != null && !a.total_is_estimated ? a.total_price : Number.POSITIVE_INFINITY;
    const totalB = b.total_price != null && !b.total_is_estimated ? b.total_price : Number.POSITIVE_INFINITY;
    return totalA - totalB || Number(a.price) - Number(b.price);
  });
}

export function getSizeRecommendationLabel(match: SizeMatch): string {
  if (match === 'match') return 'Your size available';
  if (match === 'possible') return 'Possible size match — check the brand chart';
  if (match === 'no_match') return 'Your size not found';
  return 'Availability unverified';
}
