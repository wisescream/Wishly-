import { describe, expect, it } from "vitest";
import { getTitleCoverage } from "./title-match";

describe("possible title matching", () => {
  it("requires meaningful product words and measures target coverage", () => {
    expect(getTitleCoverage("Sony WH-1000XM5 Wireless Headphones", "Sony WH-1000XM5 Noise Cancelling Wireless Headphones")).toBe(1);
    expect(getTitleCoverage("Sony WH-1000XM5 Wireless Headphones", "Generic Wireless Headphones")).toBeLessThan(0.5);
    expect(getTitleCoverage("the and for", "the and for")).toBe(0);
  });
});
