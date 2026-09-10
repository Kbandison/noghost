import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";

/**
 * Where a password-reset email lands.
 *
 * Supabase mails a `token_hash` and this exchanges it for a short-lived
 * recovery session, which is what `updateUser({ password })` on the next screen
 * acts on. Without this route the link resolved to whatever the project's Site
 * URL pointed at — the member app's home page — and the reset silently did
 * nothing.
 *
 * Unlike the member app's preview route this is **not** flag-gated and does not
 * check the host. It is not a preview door: it only ever produces a session
 * that can change a password, it requires a Supabase-issued single-use token,
 * and a console whose only credential recovery path is "ask another admin" is
 * one lost password away from nobody being able to review an application.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  // Recovery only. An invite or an email-change token would also produce a
  // session, and neither should be redeemable at a password-reset endpoint.
  if (!tokenHash || type !== "recovery") {
    redirect("/reset-password?state=bad-link");
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });

  if (error) {
    console.error(`[admin] recovery verifyOtp: ${error.message}`);
    redirect("/reset-password?state=expired");
  }

  redirect("/reset-password?state=set");
}
