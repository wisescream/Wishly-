import { describe, expect, it } from "vitest";
import { primaryRetailerValidationMarket } from "./retailer-market-priority.ts";

describe("retailer validation market scheduling", () => {
  it("prioritizes Morocco three quarters of the time while reserving global slots", () => {
    const slot = 15 * 60 * 1000;
    expect([0, 1, 2, 3].map((n) => primaryRetailerValidationMarket(n * slot))).toEqual(["MA", "MA", "MA", "GLOBAL"]);
  });
});
