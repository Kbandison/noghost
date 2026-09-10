import { BRAND } from "@noghost/config";
import { priceIdFor, quoteSeat, type Quote } from "@noghost/logic";
import { createServiceClient } from "@noghost/db/service";
import { stripeClient } from "./stripe";

/**
 * Turning an admission into a seat — spec §4.2 and Phase 2's "Stripe products +
 * checkout + webhook → season_members".
 *
 * The price is quoted from the same `quoteSeat` the claim screen renders, and
 * both count `season_members` rather than admitted applications: a seat is
 * early-bird because somebody paid for it. Quoting one number and charging
 * another is the specific failure this shape exists to prevent.
 */

export interface ClaimContext {
  quote: Quote;
  seasonName: string;
  claimDeadline: string | null;
}

/** What the claim screen needs to say, without deciding whether to charge. */
export async function claimContext(
  seasonId: string,
  claimDeadline: string | null,
): Promise<ClaimContext | null> {
  const db = createServiceClient();

  const { data: season } = await db
    .from("seasons")
    .select("id,name,price_early_cents,price_standard_cents,early_bird_cap")
    .eq("id", seasonId)
    .maybeSingle();
  if (!season) return null;

  const { count } = await db
    .from("season_members")
    .select("id", { count: "exact", head: true })
    .eq("season_id", seasonId);

  return {
    quote: quoteSeat(season, count ?? 0),
    seasonName: season.name,
    claimDeadline,
  };
}

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; reason: string };

/**
 * A Checkout session for one seat.
 *
 * Everything the webhook needs to write a membership travels in `metadata`, and
 * nothing else does. The webhook must not have to guess who paid from an email
 * address or a customer record — those are Stripe's idea of identity, and the
 * product's is `profiles.id`.
 *
 * `client_reference_id` carries the same user id, because it is the field
 * Stripe surfaces in the dashboard: somebody reconciling a payment by hand
 * should not have to open the metadata blob.
 */
export async function createCheckout(
  userId: string,
  seasonId: string,
  email: string | null,
): Promise<CheckoutResult> {
  const stripe = stripeClient();
  if (!stripe) return { ok: false, reason: "Payments aren't switched on for this deployment yet." };

  const context = await claimContext(seasonId, null);
  if (!context) return { ok: false, reason: "That season isn't there any more." };

  const price = priceIdFor(context.quote.tier);
  if (!price) {
    // Charging the wrong price is worse than refusing to charge.
    return {
      ok: false,
      reason: `No Stripe price is configured for the ${context.quote.tier} pass.`,
    };
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price, quantity: 1 }],
      client_reference_id: userId,
      // Prefilled but not trusted: the webhook reads metadata, never this.
      customer_email: email ?? undefined,
      metadata: { user_id: userId, season_id: seasonId, tier: context.quote.tier },
      payment_intent_data: {
        // Repeated onto the intent because that is the object the webhook
        // records, and a refund six months later is reconciled from it.
        metadata: { user_id: userId, season_id: seasonId },
      },
      success_url: `${BRAND.APP_URL}/apply/review?claimed=1`,
      cancel_url: `${BRAND.APP_URL}/apply/review?claimed=0`,
    });

    if (!session.url) return { ok: false, reason: "Stripe didn't return a checkout link." };
    return { ok: true, url: session.url };
  } catch (cause) {
    console.error(`[claim] checkout for ${userId}: ${cause instanceof Error ? cause.message : cause}`);
    return { ok: false, reason: "Couldn't start checkout. Try again in a moment." };
  }
}
