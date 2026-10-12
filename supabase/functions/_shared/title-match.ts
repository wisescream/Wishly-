const STOP_WORDS = new Set(["the", "and", "for", "with", "from", "new", "official", "shop", "buy", "online", "price", "free", "shipping", "sale", "best", "deal", "product", "original"]);

export function getTitleCoverage(target: string, candidate: string): number {
  const normalize = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]+/g) || [];
  const targetWords = [...new Set(normalize(target).filter((word) => word.length > 1 && !STOP_WORDS.has(word)))];
  if (targetWords.length < 2) return 0;
  const candidateWords = new Set(normalize(candidate));
  const matching = targetWords.filter((word) => candidateWords.has(word)).length;
  return matching / targetWords.length;
}
