import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";

/**
 * Redeems a Supabase-issued auth token into a session — the preview door.
 *
 * NoGhost signs in with a phone OTP and nothing else (§7.4). This route exists
 * because that is unusable before Twilio: there is no way to look at the member
 * app at all, not to review a screen, not to check a layout, not to see whether
 * the thing being built is any good. `pnpm preview:member` mints a link through
 * the admin API and this is what the link lands on.
 *
 * **Off unless `PREVIEW_SIGN_IN=on`.** Not because redeeming a token is unsafe
 * — possession of a Supabase-issued single-use token *is* the authentication,
 * and this is the pattern every Supabase email flow uses — but because a
 * product whose only credential is a phone number should not grow a second
 * front door as a side effect of a debugging convenience. Absent the flag the
 * route does not exist, so production has exactly the one way in that §7.4
 * describes.
 *
 * 404 rather than 403 when disabled, matching `requireCron`: an unauthenticated
 * caller learns nothing about which routes are here.
 */

export const dynamic = "force-dynamic";

/*
 * Spelled out rather than imported from `@supabase/supabase-js`, which this app
 * does not depend on directly — it reaches Supabase through `@noghost/db`. The
 * list is a whitelist either way, so an unrecognised `type` is rejected before
 * it reaches the client.
 */
const TYPES = ["magiclink", "signup", "email", "recovery", "invite", "email_change"] as const;
type EmailOtpType = (typeof TYPES)[number];

export async function GET(request: Request) {
  if (process.env.PREVIEW_SIGN_IN !== "on") {
    return new Response("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") ?? "";

  if (!tokenHash || !(TYPES as readonly string[]).includes(type)) {
    redirect("/sign-in?preview=bad-link");
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as EmailOtpType,
  });

  if (error) {
    console.error(`[preview] verifyOtp: ${error.message}`);
    redirect("/sign-in?preview=expired");
  }

  /*
   * Fixed destination, never a `next` parameter from the query string. A
   * redirect target an attacker controls turns any auth callback into an open
   * redirect, and there is no case here that needs one — the preview always
   * wants the same screen.
   */
  redirect("/tonight");
}
