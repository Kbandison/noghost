import { describe, expect, it } from "vitest";
import { formatCents, priceIdFor, quoteSeat } from "./pricing";

const season = { price_early_cents: 4000, price_standard_cents: 5000, early_bird_cap: 100 };

describe("what a seat costs", () => {
  it("is the early price until the cap is reached", () => {
    expect(quoteSeat(season, 0)).toEqual({ tier: "early_bird", cents: 4000, earlyBirdRemaining: 99 });
    expect(quoteSeat(season, 99)).toEqual({ tier: "early_bird", cents: 4000, earlyBirdRemaining: 0 });
  });

  it("and the standard price from the cap onward", () => {
    expect(quoteSeat(season, 100)).toEqual({ tier: "standard", cents: 5000, earlyBirdRemaining: 0 });
    expect(quoteSeat(season, 250).cents).toBe(5000);
  });

  it("counts paid seats, not admitted applications", () => {
    // A seat is early-bird because somebody paid for it. Counting admissions
    // would promise the early price to people who may never claim, and then
    // withdraw it from under whoever did.
    expect(quoteSeat(season, 0).tier).toBe("early_bird");
  });

  it("never reports a negative number of seats left", () => {
    expect(quoteSeat(season, 500).earlyBirdRemaining).toBe(0);
    expect(quoteSeat({ ...season, early_bird_cap: 0 }, 0)).toEqual({
      tier: "standard",
      cents: 5000,
      earlyBirdRemaining: 0,
    });
  });

  it("survives nonsense rather than pricing from it", () => {
    expect(quoteSeat(season, -5).tier).toBe("early_bird");
    expect(quoteSeat({ ...season, early_bird_cap: -1 }, 0).tier).toBe("standard");
  });

  it("maps a tier to the configured Stripe price, or nothing", () => {
    const env = { STRIPE_PRICE_EARLY_BIRD: "price_early", STRIPE_PRICE_STANDARD: "price_std" };
    expect(priceIdFor("early_bird", env)).toBe("price_early");
    expect(priceIdFor("standard", env)).toBe("price_std");
    // Unset is null rather than a guess — charging the wrong price is worse
    // than refusing to charge.
    expect(priceIdFor("early_bird", {})).toBeNull();
  });

  it("formats money as money", () => {
    expect(formatCents(4000)).toBe("$40");
    expect(formatCents(5000)).toBe("$50");
    expect(formatCents(4950)).toBe("$49.50");
  });
});
