import { describe, expect, it } from "vitest";
import { parseGoogleLensCandidates } from "./serpapi-lens.ts";

describe("Google Lens response parsing", () => {
  it("ranks exact results first and deduplicates URLs without inventing prices", () => {
    const candidates = parseGoogleLensCandidates({
      exact_matches: [{ title: "Exact coat", link: "https://shop.example/coat", source: "Shop", price: 10 }],
      visual_matches: [
        { title: "Same coat", link: "https://shop.example/coat/", thumbnail: "https://img.example/coat.jpg" },
        { title: "Similar coat", link: "https://other.example/coat" },
      ],
    });
    expect(candidates.map((candidate) => candidate.title)).toEqual(["Exact coat", "Similar coat"]);
    expect(candidates[0].confidence).toBeGreaterThan(candidates[1].confidence);
    expect(candidates.every((candidate) => candidate.price === null && candidate.currency === "")).toBe(true);
  });

  it("ignores malformed matches", () => {
    expect(parseGoogleLensCandidates({ exact_matches: [null, {}, { title: "unsafe", link: "javascript:alert(1)" }] }))
      .toMatchObject([{ title: "unsafe", url: null, price: null }]);
  });
});
