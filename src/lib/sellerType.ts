export const SELLER_TYPES = [
  'official',
  'authorized',
  'independent',
  'marketplace',
  'reseller',
  'outlet',
  'second_hand',
  'unknown',
] as const;

export type SellerType = typeof SELLER_TYPES[number];

export function matchesSellerType(value: string | null | undefined, filter: string): boolean {
  return filter === 'all' || (value || 'unknown') === filter;
}

export function formatSellerType(value: string | null | undefined): string {
  return (value || 'unknown').replace(/_/g, ' ');
}
