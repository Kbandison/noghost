"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";

export interface SignInState {
  error?: string;
}

/**
 * One message for every failure — spec §7.3's allow-list is not a directory.
 *
 * A wrong password, an address with no account, and a real account that isn't
 * on the allow-list all return this. Distinguishing them would turn the sign-in
 * form into an oracle for "which addresses are worth attacking", and the set of
 * admins is small enough that confirming one is a meaningful leak.
 */
const REFUSED = "Those details didn't match.";

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: REFUSED };

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) return { error: REFUSED };

  // Password proved the account. This proves the *authorisation* — and it asks
  // the database, through the same `is_admin()` predicate every RLS policy
  // uses, rather than comparing against an env var the database cannot see.
  const { data: row } = await supabase
    .from("admin_users")
    .select("id,active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!row?.active) {
    // Don't leave a valid non-admin session lying around on the admin origin.
    await supabase.auth.signOut();
    return { error: REFUSED };
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  // `nextLevel === 'aal2'` means a verified factor exists; if the session
  // hasn't reached aal2 yet, it still owes a code.
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect("/sign-in/verify");
  if (aal?.nextLevel !== "aal2") redirect("/security/set-up");

  redirect("/");
}

export interface VerifyState {
  error?: string;
}

export async function verifyTotp(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "Six digits." };

  const supabase = await supabaseServer();

  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { error: "We couldn't reach the authenticator service. Try again." };

  const factor = factors?.totp?.[0];
  if (!factor) redirect("/security/set-up");

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) {
    return { error: "That code didn't match. Codes rotate every 30 seconds — try the next one." };
  }

  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
