export function getGenderVariant(value: string): "women" | "men" | "unisex" | null {
  if (/\b(?:women'?s|female)\b/i.test(value)) return "women";
  if (/\b(?:men'?s|male)\b/i.test(value)) return "men";
  if (/\bunisex\b/i.test(value)) return "unisex";
  return null;
}

/** A requested gender variant must be stated on the listing to count as exact. */
export function confirmsGenderVariant(target: string | null, candidate: string | null): boolean {
  return target === null || target === candidate;
}
