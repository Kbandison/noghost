import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createServiceClient } from "@noghost/db/service";

/**
 * Rate limiting — spec §11 phase 7.
 *
 * Counted in Postgres rather than in memory, because a per-instance counter on
 * a platform that runs many instances is not a limit, it is a suggestion. See
 * 0019 for the window shape.
 *
 * Every caller here goes through the service role, and `hit_rate_limit` has its
 * EXECUTE revoked from `authenticated` — a client that could call it directly
 * could exhaust somebody else's allowance by guessing their key.
 */

/**
 * The caller's address, as far as the platform will say.
 *
 * `x-forwarded-for` is a client-controllable header everywhere except behind a
 * proxy that overwrites it, which is what Vercel does — so the *first* entry is
 * the real client and the rest is whatever they appended. Taking the last entry
 * (a common mistake) hands the key to the caller and makes the limit useless.
 *
 * `null` when there is no address to be had, and the caller decides what that
 * means. It is not treated as one shared bucket: that would let a single actor
 * with a stripped header lock out everybody else in the same state.
 */
async function clientAddress(): Promise<string | null> {
  const header = await headers();
  const forwarded = header.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || header.get("x-real-ip") || null;
}

/**
 * Hashed before it is stored, and salted with the bucket.
 *
 * An IP address is personal data, and a table of them next to a marketing
 * signup is a log of who visited. The limiter only ever needs to know whether
 * two requests came from the same place, which a hash answers exactly as well.
 * Salting per bucket means the same address in two buckets is two unrelated
 * keys, so the table cannot be pivoted into a cross-feature history of one
 * person.
 */
function keyFor(bucket: string, value: string): string {
  return createHash("sha256").update(`${bucket}:${value}`).digest("hex").slice(0, 32);
}

export interface RateLimit {
  /** How many attempts inside the window. */
  limit: number;
  windowSeconds: number;
  /**
   * What an infrastructure error means.
   *
   * `allow` (the default) suits a waitlist: a limiter that fails closed turns a
   * degraded database into a total outage of the thing it guards, and a handful
   * of unbounded signups during an incident is the cheaper end of the trade.
   *
   * `deny` suits anything where the guarded action is the attack — guessing a
   * six-digit code, or spending somebody's money on SMS. There the inverse
   * holds: an outage is recoverable and an unbounded attempt window is not.
   */
  onError?: "allow" | "deny";
}

/**
 * Returns true when the caller may proceed.
 *
 * `identity` is what the limit is counted against — a phone number, a user id.
 * Omit it and the caller's address is used. Either way it is hashed before it
 * leaves this file.
 *
 * See `onError` for what an infrastructure failure means; the default is open,
 * and auth endpoints deliberately pass `deny`.
 */
export async function allowRequest(
  bucket: string,
  { limit, windowSeconds, onError = "allow" }: RateLimit,
  identity?: string,
): Promise<boolean> {
  const value = identity ?? (await clientAddress());
  if (!value) {
    /*
     * No address and no explicit identity: nothing to count against. Allowed
     * even under `deny`, because the alternative is refusing every request in
     * an environment that does not forward an address — which is most local
     * setups, and would make this impossible to develop against.
     *
     * Logged rather than silent so that environment is visible.
     */
    console.warn(`[rate-limit] ${bucket}: no client address to key on`);
    return true;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("hit_rate_limit", {
    p_bucket: bucket,
    p_key: keyFor(bucket, value),
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    /*
     * A missing function is not a failure mode, it is an unapplied migration —
     * and it is always allowed through, whatever `onError` says.
     *
     * Denying here would mean 0019 going unapplied takes sign-in down
     * completely, which is a far worse outcome than an unlimited one, and a
     * confusing one to diagnose: every endpoint would refuse everybody with no
     * indication why. Loud, specific, and open.
     */
    if (error.code === "PGRST202" || /could not find the function/i.test(error.message)) {
      console.error(
        `[rate-limit] ${bucket}: hit_rate_limit() does not exist — apply ` +
          `0019_rate_limits.sql. This endpoint is UNLIMITED until you do.`,
      );
      return true;
    }

    console.error(`[rate-limit] ${bucket}: ${error.message}`);
    return onError === "allow";
  }
  return data !== false;
}
