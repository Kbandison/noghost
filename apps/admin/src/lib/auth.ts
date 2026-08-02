import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase";

/**
 * The admin gate — spec §7.3: email allow-list, password, and TOTP.
 *
 * Three separate conditions, checked here and nowhere else:
 *
 *   1. a session exists
 *   2. the caller has an active row in `admin_users`
 *   3. the session has cleared TOTP (assurance level 2)
 *
 * Condition 2 is verified by *reading* rather than by comparing an email
 * against an env var. The `admins read the allow-list` policy is `using
 * (is_admin())`, so a select of your own row returns exactly one row if you
 * are an admin and zero if you are not. The database answers the question, so
 * this cannot drift from what RLS will actually permit on every other table.
 *
 * The proxy does not do any of this. An optimistic proxy check is a redirect,
 * not a boundary — see the comment there.
 */

export interface AdminIdentity {
  id: string;
  email: string;
}

type Gate =
  | { ok: true; admin: AdminIdentity }
  | { ok: false; reason: "signed-out" | "not-admin" | "needs-totp-enrolment" | "needs-totp" };

export async function adminGate(): Promise<Gate> {
  const supabase = await supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "signed-out" };

  const { data: row } = await supabase
    .from("admin_users")
    .select("id,email,active")
    .eq("id", user.id)
    .maybeSingle();

  if (!row?.active) return { ok: false, reason: "not-admin" };

  /*
   * TOTP. `nextLevel` is aal2 once a verified factor exists, so:
   *   currentLevel aal1 + nextLevel aal1 → no factor enrolled yet
   *   currentLevel aal1 + nextLevel aal2 → factor exists, not yet challenged
   *
   * Enrolment is forced rather than offered. An admin session reads every
   * member's date of birth, phone number and verification selfie; a password
   * alone is not a proportionate guard on that.
   */
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    return { ok: false, reason: "needs-totp" };
  }
  if (aal?.nextLevel !== "aal2") {
    return { ok: false, reason: "needs-totp-enrolment" };
  }

  return { ok: true, admin: { id: row.id, email: row.email } };
}

/** The gate as a guard: returns the admin, or navigates away. */
export async function requireAdmin(): Promise<AdminIdentity> {
  const gate = await adminGate();
  if (gate.ok) return gate.admin;

  switch (gate.reason) {
    case "signed-out":
      redirect("/sign-in");
    case "not-admin":
      // Deliberately the same destination as signed-out, with a flag the
      // sign-in page turns into one plain sentence. Distinguishing "wrong
      // password" from "you are not an admin" tells an attacker which
      // addresses are worth attacking.
      redirect("/sign-in?denied=1");
    case "needs-totp-enrolment":
      redirect("/security/set-up");
    case "needs-totp":
      redirect("/sign-in/verify");
  }
}

/** Signs out everywhere, then returns to the sign-in page. */
export async function signOutAndRedirect(): Promise<never> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
