"use client";

import { useActionState, useEffect } from "react";
import { formatCents } from "@noghost/logic";
import { Button } from "@/components/ui/button";
import { startCheckout, type ClaimState } from "./claim-actions";

const initial: ClaimState = {};

/**
 * The seat, and what it costs.
 *
 * The price is rendered from the same `quoteSeat` the checkout session charges
 * from, so the two cannot disagree — a member quoted $40 and charged $50 has
 * been overcharged, not inconvenienced.
 *
 * The deadline is stated plainly rather than counted down. §3.3 bans
 * manufactured urgency, and this is the one real deadline the product has
 * besides the fuse — §9.5.2's own words: "That deadline is real, and it's the
 * only countdown we'll ever put in front of you besides the fuse."
 */
export function ClaimSeat({
  cents,
  tier,
  earlyBirdRemaining,
  deadline,
  seasonName,
  available,
}: {
  cents: number;
  tier: "early_bird" | "standard";
  earlyBirdRemaining: number;
  deadline: string | null;
  seasonName: string;
  /** False when this deployment has no Stripe keys. Says so rather than 500ing. */
  available: boolean;
}) {
  const [state, action, pending] = useActionState(startCheckout, initial);

  /*
   * Stripe's checkout is a full navigation, not a route this app owns. Done in
   * an effect rather than inside the action so the redirect happens after React
   * has committed — navigating mid-transition drops the pending state and the
   * button flickers back to idle on a page that is already leaving.
   */
  useEffect(() => {
    if (state.url) window.location.href = state.url;
  }, [state.url]);

  return (
    <form action={action} className="space-y-4">
      <p className="text-[18px] leading-relaxed">
        Your pass is <strong>{formatCents(cents)}</strong>
        {tier === "early_bird" && (
          <span className="text-[var(--text-secondary)]">
            {" "}
            — the early price
            {earlyBirdRemaining > 0 && `, with ${earlyBirdRemaining} of those left`}
          </span>
        )}
        .
      </p>

      {deadline && (
        <p className="text-[16px] leading-relaxed text-[var(--text-secondary)]">
          Your seat is held until{" "}
          <span className="whitespace-nowrap">
            {new Date(deadline).toLocaleString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
          . After that it goes to the next person on the waitlist.
        </p>
      )}

      <p className="text-[15px] leading-relaxed text-[var(--text-dim)]">
        That&rsquo;s the whole of {seasonName}: every nightly drop, the full season, and the
        finale. There is no upgrade and nothing else to buy.
      </p>

      {state.error && (
        <p role="alert" className="text-[15px] leading-snug text-[var(--error)]">
          {state.error}
        </p>
      )}

      {available ? (
        <Button type="submit" disabled={pending || Boolean(state.url)}>
          {pending || state.url ? "Opening checkout…" : `Claim your seat — ${formatCents(cents)}`}
        </Button>
      ) : (
        <p className="text-[15px] leading-relaxed text-[var(--text-dim)]">
          Payments aren&rsquo;t switched on for this deployment yet, so there&rsquo;s nothing to
          click. Your seat is still held.
        </p>
      )}
    </form>
  );
}
