import { describe, expect, it } from "vitest";
import { normalizeBox, parseFashionDetections, toImageCrop } from "./fashion-detection.ts";

describe("fashion item detection boundaries", () => {
  it("validates and clamps model boxes", () => {
    expect(normalizeBox({ x: -0.1, y: 0.2, width: 0.5, height: 1 })).toEqual({ x: 0, y: 0.2, width: 0.4, height: 0.8 });
    expect(normalizeBox({ x: 0.2, y: 0.2, width: 0, height: 0 })).toBeNull();
  });

  it("drops invalid categories and confidence instead of trusting model output", () => {
    const result = parseFashionDetections({ items: [
      { category: "sneakers", label: "sneakers", confidence: 0.92, bbox: { x: 0.1, y: 0.5, width: 0.4, height: 0.3 } },
      { category: "whole outfit", confidence: 0.99, bbox: { x: 0, y: 0, width: 1, height: 1 } },
      { category: "jacket", confidence: 2, bbox: { x: 0, y: 0, width: 1, height: 1 } },
    ] });
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("sneakers");
  });

  it("maps normalized item regions to source-image crop pixels", () => {
    expect(toImageCrop({ x: 0.25, y: 0.5, width: 0.5, height: 0.25 }, 800, 400)).toEqual({ x: 200, y: 200, width: 400, height: 100 });
  });
});
