export type ProviderBudgetState = "available" | "exhausted" | "unavailable";

/** Fail closed for the provider whose quota cannot be confirmed, while allowing other providers to run. */
export function providerBudgetState(reserved: unknown, error: unknown): ProviderBudgetState {
  if (error) return "unavailable";
  return reserved === true ? "available" : "exhausted";
}
