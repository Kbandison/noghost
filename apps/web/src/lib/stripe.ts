import Stripe from "stripe";

/**
 * The Stripe client — spec §4.2's "Stripe Checkout + webhooks".
 *
 * Server-only, and shaped like `lib/push.ts` and `lib/email.ts` before it:
 * ask `stripeConfigured()` first, get null rather than a throw, and let the
 * caller say something useful. A deployment without Stripe keys is a valid
 * state — it is how this one has been all along — and the claim screen says so
 * rather than offering a button that 500s.
 *
 * There is exactly one thing to buy (§1: a one-time season pass, not a
 * subscription; §12 lists paid visibility, paid extra drops and paid fuse
 * extensions under "Never"), so there is no product catalogue here — just the
 * two price ids for the same seat at two moments.
 */

let client: Stripe | null = null;
let ready: boolean | null = null;

export function stripeConfigured(): boolean {
  if (ready !== null) return ready;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    ready = false;
    return ready;
  }

  try {
    client = new Stripe(key, {
      // Pinned. An account-level API upgrade must not silently change the shape
      // of a webhook this code parses — money is the wrong place to find out.
      apiVersion: "2026-08-26.dahlia",
      appInfo: { name: "NoGhost", url: "https://noghostdating.app" },
    });
    ready = true;
  } catch (cause) {
    console.error(
      `[stripe] rejected the key: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    ready = false;
  }
  return ready;
}

export function stripeClient(): Stripe | null {
  return stripeConfigured() ? client : null;
}

/** Live mode is `sk_live_`. Worth knowing before a screen offers to charge. */
export function stripeIsLive(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_");
}
