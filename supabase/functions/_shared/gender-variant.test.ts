import { describe, expect, it } from "vitest";
import { confirmsGenderVariant, getGenderVariant } from "./gender-variant.ts";

describe("gender variant matching", () => {
  it("requires a candidate to confirm the requested gender", () => {
    const target = getGenderVariant("women's running shoe");
    expect(confirmsGenderVariant(target, null)).toBe(false);
    expect(confirmsGenderVariant(target, "men")).toBe(false);
    expect(confirmsGenderVariant(target, "women")).toBe(true);
  });

  it("does not impose a gender constraint when the target is unspecified", () => {
    expect(confirmsGenderVariant(null, "men")).toBe(true);
    expect(getGenderVariant("unisex trainer")).toBe("unisex");
  });
});
