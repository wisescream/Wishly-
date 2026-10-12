export type ProductCondition = "new" | "refurbished" | "open_box" | "used" | "unknown";
export type ProductConditionMatch = "exact" | "alternative" | "unconfirmed";

export function normalizeProductCondition(value?: string | null): ProductCondition {
  const normalized = String(value || "").toLowerCase().replace(/[_-]+/g, " ");
  if (/\b(refurbished|renewed|reconditioned)\b/.test(normalized)) return "refurbished";
  if (/\bopen\s*box(?:ed)?\b/.test(normalized)) return "open_box";
  if (/\bused\b|\bpre\s*owned\b|\bsecond\s*hand\b|\bdamaged\b/.test(normalized)) return "used";
  if (/newcondition|brand\s+new|\bnew\s+condition\b|^\s*new\s*$/.test(normalized)) return "new";
  return "unknown";
}

export function formatProductCondition(value?: string | null): string {
  const condition = normalizeProductCondition(value);
  return condition === "open_box" ? "Open box" : condition[0].toUpperCase() + condition.slice(1);
}

export function compareProductConditions(target?: string | null, candidate?: string | null): ProductConditionMatch {
  const left = normalizeProductCondition(target);
  const right = normalizeProductCondition(candidate);
  if (left === "unknown" || right === "unknown") return "unconfirmed";
  return left === right ? "exact" : "alternative";
}
