const TRACKING_KEYS = new Set(["gclid", "fbclid", "dclid", "msclkid", "yclid", "mc_cid", "mc_eid"]);

/** Canonical URL key used to avoid saving the same listing with ad tags twice. */
export function normalizeProductImportUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      const normalized = key.toLowerCase();
      if (normalized.startsWith("utm_") || TRACKING_KEYS.has(normalized)) url.searchParams.delete(key);
    }
    return url.href;
  } catch {
    return null;
  }
}

export function normalizeImportVariant(value: string | null | undefined): string {
  return (value || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

/**
 * Turn only the final path segment into a search hint when a retailer page
 * cannot be fetched. This is never used as imported product data.
 */
export function productUrlSearchHint(value: string): string {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    const segments = url.pathname.split("/").filter(Boolean);
    const encodedSegment = segments[segments.length - 1] || "";
    let segment = encodedSegment;
    try { segment = decodeURIComponent(encodedSegment); } catch { /* Keep malformed path text encoded. */ }
    return segment
      .replace(/\.(?:html?|php)$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\d{5,}\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
  } catch {
    return "";
  }
}
