export interface LensCandidate {
  title: string;
  brand: null;
  model_number: null;
  gtin: null;
  image_url: string | null;
  price: null;
  currency: string;
  store: string | null;
  url: string | null;
  confidence: number;
  match_reason: string;
  source: "google_lens";
}

/** Parse Lens exact matches before visual matches; Lens candidates are never verified prices. */
export function parseGoogleLensCandidates(value: unknown, limit = 12): LensCandidate[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const body = value as Record<string, unknown>;
  const exact = Array.isArray(body.exact_matches) ? body.exact_matches : [];
  const visual = Array.isArray(body.visual_matches) ? body.visual_matches : [];
  const seen = new Set<string>();
  const rows = [
    ...exact.map((entry) => ({ entry, exact: true })),
    ...visual.map((entry) => ({ entry, exact: false })),
  ];
  return rows.flatMap(({ entry, exact: isExact }): LensCandidate[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const match = entry as Record<string, unknown>;
    const title = typeof match.title === "string" ? match.title.trim().slice(0, 500) : "";
    if (!title) return [];
    const url = typeof match.link === "string" && /^https?:\/\//i.test(match.link) ? match.link : null;
    const identity = (url || title).toLowerCase().replace(/\/$/, "");
    if (seen.has(identity)) return [];
    seen.add(identity);
    return [{
      title,
      brand: null,
      model_number: null,
      gtin: null,
      image_url: typeof match.thumbnail === "string" && /^https?:\/\//i.test(match.thumbnail) ? match.thumbnail : null,
      price: null,
      currency: "",
      store: typeof match.source === "string" ? match.source.slice(0, 120) : null,
      url,
      confidence: isExact ? 0.72 : 0.55,
      match_reason: isExact
        ? "Google Lens exact match candidate. Confirm the model and variant before saving."
        : "Visual match from Google Lens. Confirm the model and variant before saving.",
      source: "google_lens",
    }];
  }).slice(0, Math.max(0, Math.min(limit, 30)));
}
