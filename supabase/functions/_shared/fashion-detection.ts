export const FASHION_CATEGORIES = ["top", "shirt", "jacket", "coat", "hoodie", "sweater", "trousers", "jeans", "shorts", "skirt", "dress", "suit", "sneakers", "shoes", "boots", "handbag", "backpack", "hat", "jewelry", "accessory", "other"] as const;
export type FashionCategory = typeof FASHION_CATEGORIES[number];
export interface NormalizedBox { x: number; y: number; width: number; height: number }
export interface FashionDetection {
  id: string;
  category: FashionCategory;
  label: string;
  confidence: number;
  bbox: NormalizedBox;
  color: string | null;
  pattern: string | null;
  brand: string | null;
}

export function normalizeBox(value: unknown): NormalizedBox | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const box = value as Record<string, unknown>;
  const values = [box.x, box.y, box.width, box.height].map(Number);
  if (!values.every(Number.isFinite)) return null;
  const [x, y, width, height] = values;
  const left = Math.max(0, Math.min(1, x));
  const top = Math.max(0, Math.min(1, y));
  const right = Math.max(left, Math.min(1, x + width));
  const bottom = Math.max(top, Math.min(1, y + height));
  if (right - left < 0.015 || bottom - top < 0.015) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function parseFashionDetections(value: unknown): FashionDetection[] {
  const body = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (!Array.isArray(body.items)) return [];
  return body.items.slice(0, 20).flatMap((entry, index): FashionDetection[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    const category = String(item.category || "").toLowerCase() as FashionCategory;
    const bbox = normalizeBox(item.bbox);
    const label = typeof item.label === "string" ? item.label.trim().slice(0, 120) : "";
    const confidence = Number(item.confidence);
    if (!FASHION_CATEGORIES.includes(category) || !bbox || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return [];
    return [{
      id: `detected-${index}-${category}`,
      category,
      label: label || category,
      confidence,
      bbox,
      color: typeof item.color === "string" ? item.color.trim().slice(0, 80) || null : null,
      pattern: typeof item.pattern === "string" ? item.pattern.trim().slice(0, 80) || null : null,
      brand: typeof item.brand === "string" ? item.brand.trim().slice(0, 80) || null : null,
    }];
  });
}

export function toImageCrop(box: NormalizedBox, imageWidth: number, imageHeight: number) {
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth <= 0 || imageHeight <= 0) return null;
  const x = Math.max(0, Math.min(imageWidth - 1, Math.floor(box.x * imageWidth)));
  const y = Math.max(0, Math.min(imageHeight - 1, Math.floor(box.y * imageHeight)));
  const width = Math.max(1, Math.min(imageWidth - x, Math.ceil(box.width * imageWidth)));
  const height = Math.max(1, Math.min(imageHeight - y, Math.ceil(box.height * imageHeight)));
  return { x, y, width, height };
}
