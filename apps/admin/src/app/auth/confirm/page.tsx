import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { FragmentSession } from "./fragment-session";

/**
 * Where a password-reset email lands — all three shapes it can arrive in.
 *
 * The first version of this read `?token_hash=` and nothing else, which is the
 * one shape Supabase's default email never sends. `{{ .ConfirmationURL }}`
 * points at Supabase's own `/auth/v1/verify`, which redeems the token *there*
 * and then 303s here carrying the result some other way. So every real link
 * fell through to "that link is no good" — and because Supabase had already
 * spent the token, clicking again logged `One-time token not found`, which
 * reads like an expiry and is actually a handler looking for the wrong thing.
 *
 * What can arrive:
 *
 *   ?code=…         PKCE. Exchanged for a session here.
 *   #access_token=… implicit. A fragment never reaches the server, so it is
 *                   read in the browser — see `FragmentSession`.
 *   ?token_hash=…   only if the email template is switched to
 *                   `{{ .TokenHash }}`. Still handled, so changing the
 *                   template later does not break this again.
 *   ?error=…        Supabase refusing, usually an expired link. Its own words
 *                   are better than a guess.
 *
 * A page rather than a route handler because of the fragment: it is the one
 * case that cannot be answered without shipping something to the browser.
 */

export const dynamic = "force-dynamic";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  if (params.error || params.error_description) {
    console.error(`[admin] recovery link rejected: ${params.error_description ?? params.error}`);
    redirect("/reset-password?state=expired");
  }

  if (params.code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) {
      console.error(`[admin] exchangeCodeForSession: ${error.message}`);
      redirect("/reset-password?state=expired");
    }
    redirect("/reset-password?state=set");
  }

  if (params.token_hash) {
    // Only recovery. An invite or email-change token would also mint a session
    // and neither belongs at a password-reset endpoint.
    if (params.type !== "recovery") redirect("/reset-password?state=bad-link");

    const supabase = await supabaseServer();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: params.token_hash,
      type: "recovery",
    });
    if (error) {
      console.error(`[admin] recovery verifyOtp: ${error.message}`);
      redirect("/reset-password?state=expired");
    }
    redirect("/reset-password?state=set");
  }

  /*
   * Nothing in the query string. Either the implicit flow put it in the
   * fragment, or somebody opened this URL by hand — the browser is the only
   * thing that can tell the difference.
   */
  return <FragmentSession />;
}
