import { describe, expect, it } from "vitest";
import { compareProductConditions, normalizeProductCondition } from "./product-condition.ts";

describe("product condition matching", () => {
  it("keeps open-box inventory separate from used inventory", () => {
    expect(normalizeProductCondition("Open box - excellent")).toBe("open_box");
    expect(compareProductConditions("open_box", "used")).toBe("alternative");
  });

  it("normalizes retailer condition names", () => {
    expect(normalizeProductCondition("https://schema.org/RefurbishedCondition")).toBe("refurbished");
    expect(normalizeProductCondition("https://schema.org/NewCondition")).toBe("new");
    expect(normalizeProductCondition("pre-owned")).toBe("used");
    expect(normalizeProductCondition("New Balance 550")).toBe("unknown");
  });

  it("never treats an unknown condition as an exact condition match", () => {
    expect(compareProductConditions("new", "unknown")).toBe("unconfirmed");
    expect(compareProductConditions("unknown", "used")).toBe("unconfirmed");
  });
});
