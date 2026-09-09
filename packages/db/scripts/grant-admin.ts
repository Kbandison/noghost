/**
 * Put someone on the admin allow-list.
 *
 * Spec §7.3 specifies an `ADMIN_EMAILS` env var, but RLS cannot read env vars —
 * every `is_admin()` check is SQL running inside Postgres. So the allow-list is
 * the `admin_users` table, and this is how a row gets into it. (Documented as a
 * spec deviation in the README.)
 *
 *   pnpm admin:grant you@example.com              create or promote
 *   pnpm admin:grant you@example.com 'a-password' set the password too
 *   pnpm admin:grant you@example.com --revoke     deactivate, keeping the audit trail
 *   pnpm admin:grant you@example.com --reset-mfa  drop their TOTP factor
 *
 * Deliberately a script and not a console screen. The first admin has to come
 * from somewhere outside the console, and self-service promotion inside a tool
 * that already holds every member's PII is not a feature worth having.
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { ENV_PATH, loadRepoEnv } from "./env";

loadRepoEnv();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;

if (!URL || !SECRET) {
  console.error(`\nNeed NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in ${ENV_PATH}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const email = args[0]?.trim().toLowerCase();
const revoking = args.includes("--revoke");
const resettingMfa = args.includes("--reset-mfa");
const passwordArg = args[1] && !args[1].startsWith("--") ? args[1] : undefined;

if (!email || !email.includes("@")) {
  console.error("\nUsage: pnpm admin:grant <email> [password] [--revoke] [--reset-mfa]\n");
  process.exit(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: any = createClient(URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail(target: string) {
  // listUsers is paginated and has no server-side email filter, so page until
  // found. The admin set is tiny; this will not be a hot path.
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const found = data?.users?.find(
      (u: { email?: string }) => u.email?.toLowerCase() === target,
    );
    if (found) return found;
    if (!data?.users || data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  const existing = await findUserByEmail(email!);

  if (resettingMfa) {
    if (!existing) {
      console.error(`\nNo account for ${email}.\n`);
      process.exit(1);
    }

    // The recovery path the sign-in screen promises: "Lost the device? Another
    // admin can remove your factor so you can enrol again." Removing the factor
    // drops the session back to aal1, so the console forces a fresh enrolment
    // on next sign-in rather than letting them in on the password alone.
    const { data, error } = await db.auth.admin.mfa.listFactors({ userId: existing.id });
    if (error) {
      console.error(`\nCouldn't list factors: ${error.message}\n`);
      process.exit(1);
    }

    const factors = data?.factors ?? [];
    for (const factor of factors) {
      const { error: delError } = await db.auth.admin.mfa.deleteFactor({
        userId: existing.id,
        id: factor.id,
      });
      if (delError) console.error(`  ✗ ${factor.id}: ${delError.message}`);
    }

    console.log(
      `\n✓ Removed ${factors.length} factor(s) for ${email}. ` +
        `They'll be asked to enrol again on their next sign-in.\n`,
    );
    return;
  }

  if (revoking) {
    if (!existing) {
      console.error(`\nNo account for ${email}.\n`);
      process.exit(1);
    }
    // Deactivated, not deleted — `admin_audit.admin_id` points at this user and
    // an audit trail with dangling actors is worth less than one with inactive
    // ones.
    const { error } = await db.from("admin_users").update({ active: false }).eq("id", existing.id);
    if (error) {
      console.error(`\nCouldn't revoke: ${error.message}\n`);
      process.exit(1);
    }
    console.log(`\n✓ ${email} can no longer open the console. Their audit history is intact.\n`);
    return;
  }

  let userId = existing?.id;
  let generatedPassword: string | undefined;

  if (!existing) {
    // 24 bytes of base64url. Printed once, never stored by this script.
    generatedPassword = passwordArg ?? randomBytes(24).toString("base64url");

    const { data, error } = await db.auth.admin.createUser({
      email,
      password: generatedPassword,
      email_confirm: true,
    });
    if (error) {
      console.error(`\nCouldn't create the account: ${error.message}\n`);
      process.exit(1);
    }
    userId = data.user.id;
  } else if (passwordArg) {
    const { error } = await db.auth.admin.updateUserById(existing.id, { password: passwordArg });
    if (error) {
      console.error(`\nCouldn't set the password: ${error.message}\n`);
      process.exit(1);
    }
  }

  const { error } = await db
    .from("admin_users")
    .upsert({ id: userId, email, active: true }, { onConflict: "id" });

  if (error) {
    console.error(`\nCouldn't add them to the allow-list: ${error.message}\n`);
    process.exit(1);
  }

  console.log(`\n✓ ${email} can open the console.`);
  if (generatedPassword) {
    console.log(`\n  Password (shown once): ${generatedPassword}`);
  }
  console.log(
    `\n  Two-factor is enrolled on first sign-in — the console won't open until it is.\n`,
  );
}

void main();
