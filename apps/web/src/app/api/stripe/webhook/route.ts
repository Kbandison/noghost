import type Stripe from "stripe";
import { createServiceClient } from "@noghost/db/service";
import { stripeClient } from "@/lib/stripe";

/**
 * The Stripe webhook — the only thing in the product that may write
 * `season_members`.
 *
 * 0006 says so out loud: "Insert is service-role only (the Stripe webhook).
 * Service role bypasses RLS, so the deliberate absence of an insert policy is
 * the enforcement." That comment has been describing a route that did not
 * exist. Membership has only ever come from the seed script, which is why
 * `pnpm db:seed:remote --members` had to exist at all.
 *
 * Four properties, and each one is a way this goes wrong if it is missing:
 *
 *   verified      the raw body is checked against `STRIPE_WEBHOOK_SECRET`.
 *                 Without it this endpoint is "anyone on the internet may grant
 *                 themselves a paid seat".
 *   idempotent    Stripe retries on any non-2xx and re-sends on its own
 *                 schedule. `processed_webhook_events` is the ledger, and
 *                 `season_members.stripe_payment_intent` is unique underneath
 *                 it — belt and braces, because a duplicate membership is a
 *                 double charge somebody has to be refunded for.
 *   attributed    who paid comes from `metadata.user_id`, never from the email
 *                 on the card. Those are different people often enough to
 *                 matter, and only one of them is the member.
 *   forgiving     a 200 for an event we do not handle, so Stripe stops
 *                 retrying. A 500 on an irrelevant event is how a retry storm
 *                 starts.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const stripe = stripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !secret) {
    // 404, matching `requireCron`: an unauthenticated caller learns nothing
    // about which endpoints exist here.
    console.error("[stripe] webhook hit with no STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
    return new Response("Not found", { status: 404 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  /*
   * The raw body, not the parsed one. Stripe signs the exact bytes, and
   * `JSON.parse` followed by `JSON.stringify` reorders keys — the signature
   * then fails for a payload that is otherwise perfectly valid.
   */
  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, secret);
  } catch (cause) {
    console.error(`[stripe] bad signature: ${cause instanceof Error ? cause.message : cause}`);
    return new Response("Invalid signature", { status: 400 });
  }

  const db = createServiceClient();

  /*
   * Claim the event before doing the work. The primary key on
   * `processed_webhook_events` is the ledger: a concurrent redelivery loses the
   * insert and returns here, rather than both of them writing a membership.
   */
  const { error: claimError } = await db
    .from("processed_webhook_events")
    .insert({ id: event.id, provider: "stripe" });

  if (claimError) {
    if (/duplicate|unique/i.test(claimError.message)) {
      return Response.json({ ok: true, already: event.id });
    }
    console.error(`[stripe] ledger ${event.id}: ${claimError.message}`);
    // 500 so Stripe retries — the event has not been handled.
    return new Response("Could not record the event", { status: 500 });
  }

  try {
    if (event.type !== "checkout.session.completed") {
      return Response.json({ ok: true, ignored: event.type });
    }

    const session = event.data.object;
    if (session.payment_status !== "paid") {
      // An unpaid or async-pending session is not a seat. Stripe sends
      // `checkout.session.async_payment_succeeded` later if it settles.
      return Response.json({ ok: true, unpaid: session.payment_status });
    }

    const userId = session.metadata?.user_id ?? session.client_reference_id;
    const seasonId = session.metadata?.season_id;
    const intent =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);

    if (!userId || !seasonId || !intent) {
      /*
       * 200, not 500. Retrying cannot add metadata that was never attached, so
       * this is logged loudly and closed — a session created outside
       * `createCheckout` (a payment link, a dashboard test) lands here.
       */
      console.error(
        `[stripe] ${event.id} has no attribution: user=${userId} season=${seasonId} intent=${intent}`,
      );
      return Response.json({ ok: true, unattributed: true });
    }

    const { error: memberError } = await db.from("season_members").insert({
      user_id: userId,
      season_id: seasonId,
      stripe_payment_intent: intent,
      price_paid_cents: session.amount_total ?? 0,
    });

    if (memberError && !/duplicate|unique/i.test(memberError.message)) {
      console.error(`[stripe] membership for ${userId}: ${memberError.message}`);
      return new Response("Could not record the membership", { status: 500 });
    }

    /*
     * The application follows the money. Failure here is logged, not retried:
     * the seat exists and the member is in, and re-running the webhook to fix a
     * status would re-run everything above it.
     */
    const { data: application } = await db
      .from("applications")
      .select("id,status")
      .eq("user_id", userId)
      .eq("season_id", seasonId)
      .maybeSingle();

    if (!application) {
      console.error(`[stripe] ${userId} paid for ${seasonId} with no application row`);
    } else {
      const { error: advanceError } = await db.rpc("advance_application", {
        p_application_id: application.id,
        p_new_status: "claimed",
      });
      /*
       * "Cannot move an application" is expected on a redelivery — it is
       * already `claimed` — and is not worth logging as a failure.
       */
      if (advanceError && !/Cannot move an application/i.test(advanceError.message)) {
        console.error(`[stripe] advance ${userId} → claimed: ${advanceError.message}`);
      }
    }

    return Response.json({
      ok: true,
      member: userId,
      cents: session.amount_total ?? 0,
      duplicate: Boolean(memberError),
    });
  } catch (cause) {
    /*
     * The ledger row is removed so a retry is not swallowed as "already
     * processed". Losing the row is safe — the unique payment intent still
     * stops a second membership.
     */
    await db.from("processed_webhook_events").delete().eq("id", event.id);
    console.error(`[stripe] ${event.id}: ${cause instanceof Error ? cause.message : cause}`);
    return new Response("Handler failed", { status: 500 });
  }
}
