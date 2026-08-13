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
}

/**
 * Returns true when the caller may proceed.
 *
 * Fails **open** on an infrastructure error, deliberately, and it is worth
 * being explicit about the trade: if the database is unreachable, a limiter
 * that fails closed turns a degraded backend into a total outage of the thing
 * it guards. For a waitlist signup the cost of the other choice — a handful of
 * unbounded writes during an incident — is much smaller. Anything where the
 * inverse holds (an OTP, a payment) should not reuse this default.
 */
export async function allowRequest(
  bucket: string,
  { limit, windowSeconds }: RateLimit,
  identity?: string,
): Promise<boolean> {
  const value = identity ?? (await clientAddress());
  if (!value) {
    // No address and no explicit identity: nothing to count against. Logged so
    // an environment that never forwards one is visible rather than silently
    // unprotected.
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
    console.error(`[rate-limit] ${bucket}: ${error.message}`);
    return true;
  }
  return data !== false;
}
