import { describe, expect, it } from "vitest";
import { imageCropPixels, selectionBox } from "./fashionImage";

describe("interactive image item selection", () => {
  it("creates a normalized selection regardless of drag direction", () => {
    expect(selectionBox(0.8, 0.7, 0.2, 0.3)).toEqual({ x: 0.2, y: 0.3, width: 0.6000000000000001, height: 0.39999999999999997 });
    expect(selectionBox(0.2, 0.3, 0.21, 0.31)).toBeNull();
  });

  it("uses original image coordinates to create a crop", () => {
    expect(imageCropPixels({ x: 0.25, y: 0.5, width: 0.5, height: 0.25 }, 800, 400)).toEqual({ x: 200, y: 200, width: 400, height: 100 });
  });
});
