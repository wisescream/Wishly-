import { describe, expect, it } from "vitest";
import { hasScheduledSearchProvider } from "./scheduled-provider-config.ts";

describe("scheduled search provider configuration", () => {
  it("does not count a disabled OpenRouter key as an available provider", () => {
    expect(hasScheduledSearchProvider({ openRouterKey: "configured", openRouterEnabled: false })).toBe(false);
  });

  it("accepts providers that the scheduled worker can actually invoke", () => {
    expect(hasScheduledSearchProvider({ openRouterKey: "configured", openRouterEnabled: true })).toBe(true);
    expect(hasScheduledSearchProvider({ serpApiKey: "configured", openRouterEnabled: false })).toBe(true);
    expect(hasScheduledSearchProvider({ tavilyKey: "configured", openRouterEnabled: false })).toBe(true);
    expect(hasScheduledSearchProvider({ serpApiKey: " ", tavilyKey: null, openRouterEnabled: false })).toBe(false);
  });
});
