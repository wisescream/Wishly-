import { describe, expect, it } from "vitest";
import { providerBudgetState } from "./provider-budget.ts";

describe("provider quota reservation", () => {
  it("distinguishes available, exhausted, and unavailable budget checks", () => {
    expect(providerBudgetState(true, null)).toBe("available");
    expect(providerBudgetState(false, null)).toBe("exhausted");
    expect(providerBudgetState(null, new Error("RPC unavailable"))).toBe("unavailable");
  });
});
