"use server";

import { BRAND } from "@noghost/config";
import { supabaseServer } from "@/lib/supabase";

export interface ResetState {
  error?: string;
  sent?: boolean;
}

/**
 * "I've forgotten my password" — spec §7.3's admin auth, which had no way back
 * in if you lost the password.
 *
 * The console is email + password + TOTP, and until now the only path to a new
 * password was the Supabase dashboard. Requesting a reset sent mail pointing at
 * the project's Site URL, which is the member app; that has no recovery
 * handler, so the link landed on a marketing home page and nothing happened.
 *
 * **Always reports success.** A reset form that says "no such account" is an
 * account-enumeration oracle, and this one guards the console that reads
 * members' dates of birth and verification selfies — the address list is worth
 * more here than on the member side.
 *
 * The redirect is built from `BRAND.ADMIN_URL` rather than the request's own
 * host so a link cannot be pointed somewhere else by whoever asked for it.
 */
export async function requestReset(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return { error: "Enter the email you sign in with." };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${BRAND.ADMIN_URL}/auth/confirm`,
  });

  if (error) {
    // Logged, never surfaced: the caller is told the same thing either way.
    console.error(`[admin] reset for ${email}: ${error.message}`);
  }

  return { sent: true };
}

/**
 * Setting the new password, once the recovery link has established a session.
 *
 * `updateUser` acts on whoever the cookie says you are, so there is no token to
 * pass and nothing to forge — a caller without a recovery session has no user
 * to update and is refused by Supabase.
 */
export async function setPassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 12) {
    // Longer than Supabase's default six. This password opens a console that
    // reads verification selfies; the floor should not be the framework's.
    return { error: "Use at least 12 characters." };
  }
  if (password !== confirm) {
    return { error: "Those two don't match." };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error(`[admin] set password: ${error.message}`);
    return {
      error: /session|Auth session missing/i.test(error.message)
        ? "That reset link has expired. Ask for a new one."
        : "That didn't save. Ask for a new link and try again.",
    };
  }

  return { sent: true };
}
