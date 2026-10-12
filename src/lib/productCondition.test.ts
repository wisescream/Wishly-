import { describe, expect, it } from "vitest";
import { compareProductConditions, formatProductCondition, normalizeProductCondition } from "./productCondition";

describe("product condition normalization", () => {
  it.each([
    ["New", "new"],
    ["brand-new", "new"],
    ["New Balance 550", "unknown"],
    ["refurbished", "refurbished"],
    ["Renewed", "refurbished"],
    ["open box", "open_box"],
    ["Open-box", "open_box"],
    ["pre-owned", "used"],
    ["Used - good condition", "used"],
    ["damaged", "used"],
    ["", "unknown"],
    ["condition unavailable", "unknown"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeProductCondition(input)).toBe(expected);
  });

  it("formats open-box inventory distinctly from used inventory", () => {
    expect(formatProductCondition("open_box")).toBe("Open box");
    expect(formatProductCondition("used")).toBe("Used");
    expect(compareProductConditions("open_box", "used")).toBe("alternative");
    expect(compareProductConditions("new", "unknown")).toBe("unconfirmed");
    expect(compareProductConditions("new", "new")).toBe("exact");
  });
});
