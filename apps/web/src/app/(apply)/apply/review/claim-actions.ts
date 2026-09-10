"use server";

import { createCheckout } from "@/lib/claim";
import { supabaseServer } from "@/lib/supabase";

export interface ClaimState {
  error?: string;
  /**
   * Stripe's hosted checkout. Returned rather than redirected to, because
   * `typedRoutes` types `redirect()` against this app's own routes and casting
   * around that would silence a real error later. The client navigates.
   */
  url?: string;
}

/**
 * Buying the seat — spec §4.2, Phase 2's checkout.
 *
 * Re-reads the application here rather than trusting a form field. The amount
 * and the recipient are decided server-side from the caller's own session,
 * because a hidden input saying which season to buy into is a hidden input
 * somebody can change.
 *
 * Refuses anything but `admitted`. `claimed` already has a seat, and every
 * other status has not been offered one — charging either would be taking money
 * for something the product cannot deliver.
 */
/*
 * Takes no arguments, and that is the point. Everything it needs — who is
 * asking, which season, what it costs — is read from the session and the
 * database, because a form field naming the season to buy into is a form field
 * somebody can edit. `useActionState` passes a previous state and a FormData;
 * declaring neither is how this says it reads neither.
 */
export async function startCheckout(): Promise<ClaimState> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };

  const { data: application } = await supabase
    .from("applications")
    .select("id,status,season_id,claim_deadline")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!application) return { error: "We can't find your application." };
  if (application.status === "claimed") return { error: "You've already claimed your seat." };
  if (application.status !== "admitted") {
    return { error: "There's no seat to claim on this application yet." };
  }

  /*
   * The deadline is checked here as well as by `claim-sweep`. The sweep runs
   * hourly, so between the deadline passing and the next run there is a window
   * where the row still says `admitted` — and taking payment inside it would
   * sell a seat that is on its way to somebody on the waitlist.
   */
  if (application.claim_deadline && Date.parse(application.claim_deadline) < Date.now()) {
    return { error: "That claim window has closed. Your seat went to the waitlist." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .maybeSingle();

  const result = await createCheckout(user.id, application.season_id, profile?.email ?? null);
  if (!result.ok) return { error: result.reason };

  return { url: result.url };
}
