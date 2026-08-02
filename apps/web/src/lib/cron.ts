import { timingSafeEqual } from "node:crypto";

/**
 * Every cron endpoint verifies `CRON_SECRET` — spec §4.3.
 *
 * These routes run as the service role and move money-adjacent state (claim
 * windows, admissions, chat closures). An unauthenticated caller who could
 * reach one could expire every open claim window in the cohort, so this is the
 * only thing standing between a public URL and that.
 *
 * Returns a Response to send when the request is not authorised, or null when
 * it is — so a route reads:
 *
 *     const denied = requireCron(request);
 *     if (denied) return denied;
 */
export function requireCron(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;

  if (!secret || secret.length < 16) {
    // Fail closed. A missing secret must never mean "let everyone in", and in
    // production it is a deployment fault worth surfacing loudly.
    console.error("[cron] CRON_SECRET is missing or too short; refusing the request");
    return new Response("Not found", { status: 404 });
  }

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  // Constant-time compare. Both buffers must be the same length for
  // `timingSafeEqual`, so length is checked first — that leaks only the
  // length, which is already implied by the secret's format.
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  const authorised = a.length === b.length && timingSafeEqual(a, b);

  if (!authorised) {
    // 404 rather than 401: an unauthenticated caller learns nothing about
    // which cron endpoints exist.
    return new Response("Not found", { status: 404 });
  }

  return null;
}
