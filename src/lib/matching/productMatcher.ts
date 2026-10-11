export interface MatchScoreResult {
  confidence: number;
  isExactMatch: boolean;
  matchType: "gtin" | "brand_model" | "sku" | "specs_title" | "none";
  reason: string;
  variantDifference?: string;
}

/**
 * Normalizes string for token comparisons: lowercase, trims, removes punctuation
 */
export function normalizeText(text?: string | null): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts storage capacity from text (e.g., '128GB', '256 GB', '1TB')
 */
export function extractCapacity(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(/\b(\d+)\s*(gb|tb|mb)\b/i);
  return match ? `${match[1]}${match[2].toUpperCase()}` : null;
}

/**
 * Extracts color mentions from text
 */
export const KNOWN_COLORS = [
  "black", "white", "silver", "gold", "space gray", "natural titanium",
  "desert titanium", "blue", "red", "green", "yellow", "purple", "pink",
  "midnight", "starlight", "graphite", "rose gold"
];

export function extractColor(text?: string | null): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const c of KNOWN_COLORS) {
    if (lower.includes(c)) return c;
  }
  return null;
}

/**
 * Extracts product condition (new, refurbished, used)
 */
export function extractCondition(text?: string | null): "new" | "refurbished" | "used" {
  if (!text) return "new";
  const lower = text.toLowerCase();
  if (lower.includes("refurbished") || lower.includes("renewed") || lower.includes("reconditioned")) {
    return "refurbished";
  }
  if (lower.includes("used") || lower.includes("pre-owned") || lower.includes("open box")) {
    return "used";
  }
  return "new";
}

/**
 * Token Jaccard similarity between two titles
 */
export function calculateTitleSimilarity(titleA: string, titleB: string): number {
  const tokensA = new Set(normalizeText(titleA).split(" ").filter(Boolean));
  const tokensB = new Set(normalizeText(titleB).split(" ").filter(Boolean));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Core Exact-Product Matcher evaluating 6 tiers of evidence
 */
export function evaluateProductMatch(
  target: {
    title: string;
    brand?: string | null;
    model_number?: string | null;
    gtin?: string | null;
    sku?: string | null;
    condition?: string;
  },
  candidate: {
    title: string;
    brand?: string | null;
    model_number?: string | null;
    gtin?: string | null;
    sku?: string | null;
    condition?: string;
  }
): MatchScoreResult {
  // 1. Variant Mismatch Check: Condition
  const targetCond = target.condition || extractCondition(target.title);
  const candCond = candidate.condition || extractCondition(candidate.title);
  if (targetCond !== candCond) {
    return {
      confidence: 0.35,
      isExactMatch: false,
      matchType: "none",
      reason: `Condition mismatch: target is ${targetCond}, candidate is ${candCond}`,
      variantDifference: `Condition: ${targetCond} vs ${candCond}`,
    };
  }

  // Conflicting identifiers are decisive negative evidence. Do not let a
  // similar title override a different GTIN or manufacturer model.
  if (target.gtin && candidate.gtin) {
    const targetGtin = target.gtin.replace(/[^\d]/g, "");
    const candidateGtin = candidate.gtin.replace(/[^\d]/g, "");
    if (targetGtin && candidateGtin && targetGtin !== candidateGtin) {
      return {
        confidence: 0,
        isExactMatch: false,
        matchType: "none",
        reason: "Conflicting product identifiers (GTIN).",
      };
    }
  }
  if (target.model_number && candidate.model_number &&
      normalizeText(target.model_number) !== normalizeText(candidate.model_number)) {
    return {
      confidence: 0,
      isExactMatch: false,
      matchType: "none",
      reason: `Manufacturer model mismatch: ${target.model_number} vs ${candidate.model_number}`,
      variantDifference: "Model number differs",
    };
  }
  if (target.brand && candidate.brand && normalizeText(target.brand) !== normalizeText(candidate.brand)) {
    return {
      confidence: 0,
      isExactMatch: false,
      matchType: "none",
      reason: `Brand mismatch: ${target.brand} vs ${candidate.brand}`,
    };
  }

  // 2. Variant Mismatch Check: Storage capacity (e.g. 128GB vs 256GB)
  const targetCap = extractCapacity(target.title);
  const candCap = extractCapacity(candidate.title);
  if (targetCap && candCap && targetCap !== candCap) {
    return {
      confidence: 0.3,
      isExactMatch: false,
      matchType: "none",
      reason: `Storage capacity mismatch: ${targetCap} vs ${candCap}`,
      variantDifference: `Capacity: ${targetCap} vs ${candCap}`,
    };
  }

  // 3. Variant Mismatch Check: Colors
  const targetColor = extractColor(target.title);
  const candColor = extractColor(candidate.title);
  if (targetColor && candColor && targetColor !== candColor) {
    return {
      confidence: 0.5,
      isExactMatch: false,
      matchType: "none",
      reason: `Color variant mismatch: ${targetColor} vs ${candColor}`,
      variantDifference: `Color: ${targetColor} vs ${candColor}`,
    };
  }

  // 4. Evidence Tier 1: Matching GTIN / EAN / UPC
  if (target.gtin && candidate.gtin) {
    const cleanTargetGtin = target.gtin.replace(/[^\d]/g, "");
    const cleanCandGtin = candidate.gtin.replace(/[^\d]/g, "");
    if (cleanTargetGtin && cleanCandGtin && cleanTargetGtin === cleanCandGtin) {
      return {
        confidence: 1.0,
        isExactMatch: true,
        matchType: "gtin",
        reason: `Exact GTIN/UPC match (${cleanTargetGtin})`,
      };
    }
  }

  // 5. Evidence Tier 2: Brand + Model Number
  if (
    target.brand && candidate.brand &&
    target.model_number && candidate.model_number
  ) {
    const brandMatch = normalizeText(target.brand) === normalizeText(candidate.brand);
    const modelMatch = normalizeText(target.model_number) === normalizeText(candidate.model_number);
    if (brandMatch && modelMatch) {
      return {
        confidence: 0.92,
        isExactMatch: true,
        matchType: "brand_model",
        reason: `Verified brand (${target.brand}) and manufacturer model (${target.model_number})`,
      };
    }
  }

  // 6. Evidence Tier 3: Known SKU match
  if (target.sku && candidate.sku && target.sku.trim() === candidate.sku.trim()) {
    return {
      confidence: 0.86,
      isExactMatch: true,
      matchType: "sku",
      reason: `Verified retailer SKU match (${target.sku})`,
    };
  }

  // 7. Evidence Tier 4: Normalized title similarity
  const sim = calculateTitleSimilarity(target.title, candidate.title);

  // If brand is known, check if it's in candidate title
  let brandBonus = 0;
  if (target.brand && normalizeText(candidate.title).includes(normalizeText(target.brand))) {
    brandBonus = 0.15;
  }

  const combinedConfidence = Math.min(0.84, sim * 0.7 + brandBonus);

  if (combinedConfidence >= 0.75) {
    return {
      confidence: Number(combinedConfidence.toFixed(2)),
      isExactMatch: combinedConfidence >= 0.85,
      matchType: "specs_title",
      reason: `High title and attribute similarity (${Math.round(combinedConfidence * 100)}%)`,
    };
  }

  if (combinedConfidence >= 0.55) {
    return {
      confidence: Number(combinedConfidence.toFixed(2)),
      isExactMatch: false,
      matchType: "specs_title",
      reason: `Moderate similarity (${Math.round(combinedConfidence * 100)}%). Requires user confirmation.`,
    };
  }

  return {
    confidence: Number(combinedConfidence.toFixed(2)),
    isExactMatch: false,
    matchType: "none",
    reason: "Low similarity score; not a verified match.",
  };
}
