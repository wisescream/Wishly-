export function getGenderVariant(value: string): "women" | "men" | "unisex" | null {
  const normalized = value.toLowerCase().replace(/[’‘]/g, "'");
  if (/\b(?:women'?s?|women\s+s|woman|female)\b/i.test(normalized)) return "women";
  if (/\b(?:men'?s?|men\s+s|man|male)\b/i.test(normalized)) return "men";
  if (/\bunisex\b/i.test(value)) return "unisex";
  return null;
}

/** A requested gender variant must be stated on the listing to count as exact. */
export function confirmsGenderVariant(target: string | null, candidate: string | null): boolean {
  return target === null || target === candidate;
}
