export type ResearchStatus = "offers_available" | "partial" | "no_matches" | "failed";

export function deriveResearchOutcome(input: {
  verifiedOffers: number;
  candidates: number;
  providerFailures: number;
  budgetReached: boolean;
  configured: boolean;
}) {
  const incomplete = !input.configured || input.providerFailures > 0 || input.budgetReached;
  const status: ResearchStatus = incomplete
    ? input.verifiedOffers || input.candidates ? "partial" : "failed"
    : input.verifiedOffers ? "offers_available" : input.candidates ? "partial" : "no_matches";
  return { status, success: !incomplete, partial: status === "partial", incomplete };
}
