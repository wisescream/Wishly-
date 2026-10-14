import { describe, expect, it } from "vitest";
import { deriveResearchOutcome } from "./research-outcome.ts";

describe("manual research outcome", () => {
  it("reports a fully completed refresh with verified offers as success", () => {
    expect(deriveResearchOutcome({ verifiedOffers: 2, candidates: 1, providerFailures: 0, budgetReached: false, configured: true }))
      .toEqual({ status: "offers_available", success: true, partial: false, incomplete: false });
  });

  it("marks candidates as partial and provider failures without results as failed", () => {
    expect(deriveResearchOutcome({ verifiedOffers: 0, candidates: 3, providerFailures: 0, budgetReached: false, configured: true }).status).toBe("partial");
    expect(deriveResearchOutcome({ verifiedOffers: 0, candidates: 0, providerFailures: 1, budgetReached: false, configured: true }))
      .toMatchObject({ status: "failed", success: false, incomplete: true });
  });

  it("never reports a partial provider result as full success", () => {
    expect(deriveResearchOutcome({ verifiedOffers: 1, candidates: 0, providerFailures: 1, budgetReached: false, configured: true }))
      .toMatchObject({ status: "partial", success: false, partial: true });
  });
});
