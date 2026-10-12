export type ProductCondition = "new" | "refurbished" | "open_box" | "used" | "unknown";
export type ProductConditionMatch = "exact" | "alternative" | "unconfirmed";

export function normalizeProductCondition(value: unknown): ProductCondition {
  const text = String(value || "").toLowerCase().replace(/[_-]+/g, " ");
  if (/refurbished|renewed|reconditioned/.test(text)) return "refurbished";
  if (/\bopen\s*box(?:ed)?\b/.test(text)) return "open_box";
  if (/\bused\b|pre owned|second hand|damaged/.test(text)) return "used";
  if (/newcondition|brand\s+new|\bnew\s+condition\b|^\s*new\s*$/.test(text)) return "new";
  return "unknown";
}

export function compareProductConditions(target: unknown, candidate: unknown): ProductConditionMatch {
  const left = normalizeProductCondition(target);
  const right = normalizeProductCondition(candidate);
  if (left === "unknown" || right === "unknown") return "unconfirmed";
  return left === right ? "exact" : "alternative";
}
