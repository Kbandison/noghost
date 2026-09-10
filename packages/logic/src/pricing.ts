/**
 * What a seat costs — spec §4.2's two one-time products.
 *
 *   pass_early_bird  $40, for the first `early_bird_cap` members
 *   pass_standard    $50, for everybody after
 *
 * Pure, so the price shown on the claim screen and the price charged at
 * checkout are computed by the same function rather than by two that can
 * disagree — which is the failure worth designing against here, because a
 * member who is quoted $40 and charged $50 has been overcharged, not
 * inconvenienced.
 *
 * §1 is emphatic that this is a one-time season pass and not a subscription,
 * and §12 lists paid visibility, paid extra drops and paid fuse extensions
 * under "Never". There is exactly one thing to buy.
 */

export type PassTier = "early_bird" | "standard";

export interface SeasonPricing {
  price_early_cents: number;
  price_standard_cents: number;
  early_bird_cap: number;
}

export interface Quote {
  tier: PassTier;
  cents: number;
  /** Seats left at the early price, once this one is taken. Never negative. */
  earlyBirdRemaining: number;
}

/**
 * `claimedSeats` is how many members the season already has — the count of
 * `season_members` rows, not admitted applications. A seat is early-bird
 * because somebody paid for it, not because a reviewer approved them; counting
 * admissions would promise the early price to people who may never claim and
 * then quietly withdraw it.
 */
export function quoteSeat(season: SeasonPricing, claimedSeats: number): Quote {
  const taken = Math.max(0, claimedSeats);
  const cap = Math.max(0, season.early_bird_cap);
  const early = taken < cap;

  return {
    tier: early ? "early_bird" : "standard",
    cents: early ? season.price_early_cents : season.price_standard_cents,
    earlyBirdRemaining: Math.max(0, cap - taken - (early ? 1 : 0)),
  };
}

/**
 * Which Stripe price id to charge.
 *
 * The ids live in env because they differ between test and live mode, and a
 * hardcoded one would charge test cards in production or fail outright. Reading
 * them here keeps the mapping in one place rather than at the call site.
 */
export function priceIdFor(tier: PassTier, env: NodeJS.ProcessEnv = process.env): string | null {
  const id = tier === "early_bird" ? env.STRIPE_PRICE_EARLY_BIRD : env.STRIPE_PRICE_STANDARD;
  return id && id.length > 0 ? id : null;
}

/** "$40", and "$49.50" if it ever needs to be. Never "4000". */
export function formatCents(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}
