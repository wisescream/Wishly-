import { describe, expect, it } from "vitest";
import { getResearchRetryDelayMs } from "./research-schedule.ts";

describe("scheduled research retry timing", () => {
  it("uses exponential delays starting at five minutes", () => {
    expect([1, 2, 3, 4].map(getResearchRetryDelayMs)).toEqual([
      5 * 60 * 1000,
      10 * 60 * 1000,
      20 * 60 * 1000,
      40 * 60 * 1000,
    ]);
  });

  it("caps retries at six hours and handles invalid attempts safely", () => {
    expect(getResearchRetryDelayMs(100)).toBe(6 * 60 * 60 * 1000);
    expect(getResearchRetryDelayMs(0)).toBe(5 * 60 * 1000);
    expect(getResearchRetryDelayMs(Number.NaN)).toBe(5 * 60 * 1000);
  });
});
