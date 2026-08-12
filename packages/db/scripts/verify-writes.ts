/**
 * Does the funnel's write path actually work — and does it actually stop?
 *
 * `verify-schema.ts` proves the migrations applied. This proves the policies
 * *behave*: it signs in as a real member and performs every write the
 * application funnel performs, then attempts the writes and reads the funnel
 * must never be able to perform.
 *
 * The negative cases are the point. A policy that permits everything passes a
 * structural check perfectly, so each positive assertion here is paired with
 * its inverse:
 *
 *   can upload into my own photo folder   / cannot upload into someone else's
 *   can submit a selfie                   / cannot read it back afterwards
 *   can read my own profile               / cannot read another member's
 *   can file my own application           / cannot advance its status
 *
 * Phone OTP is the one link this cannot cover — it needs a real SMS provider.
 * The user is created with email+password instead, which produces the same
 * `auth.uid()` and therefore exercises the identical policies.
 *
 *   pnpm db:verify:writes
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { SEED_SEASON, seedId } from "../src/seed/data";

const ENV_PATH = resolve(process.cwd(), "apps/web/.env.local");
if (existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;

if (!URL || !PUBLISHABLE || !SECRET) {
  console.error(`\nNeed all three Supabase keys in ${ENV_PATH}\n`);
  process.exit(1);
}

/*
 * Untyped clients, deliberately.
 *
 * Half the assertions below are operations that MUST be rejected — writing
 * into another member's storage folder, setting `applications.status` when no
 * client update policy exists. The generated `Database` type refuses to
 * express those at compile time, which is correct for application code and
 * useless here: the whole question is what the *database* does when asked.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const service: SupabaseClient<any> = createClient(URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const member: SupabaseClient<any> = createClient(URL, PUBLISHABLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** A throwaway member. Same `deadbeef-` prefix, so `--purge` sweeps it up. */
const TEST_ID = "deadbeef-0000-4000-8000-0000000ff001";
const TEST_EMAIL = "write-probe@noghost.test";
const TEST_PASSWORD = "probe-only-not-a-real-account-8f2a";
/** Somebody else, for the negative cases. */
const OTHER_ID = seedId(100);

// A 1×1 transparent PNG. Small enough to be free, real enough to pass the
// bucket's mime and size checks.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

let failures = 0;
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function ok(label: string, detail = "") {
  console.log(`  ${GREEN}✓${RESET} ${label}${detail ? ` ${DIM}${detail}${RESET}` : ""}`);
}
function bad(label: string, detail: string) {
  failures += 1;
  console.log(`  ${RED}✗${RESET} ${label}\n      ${RED}${detail}${RESET}`);
}
function section(t: string) {
  console.log(`\n${t}`);
}

/** Asserts an operation was refused. Silence is not refusal. */
function mustFail(label: string, error: { message: string } | null, produced?: unknown) {
  if (error) ok(label, `refused — ${error.message.slice(0, 70)}`);
  else if (Array.isArray(produced) && produced.length === 0) ok(label, "returned nothing");
  else bad(label, "the operation SUCCEEDED and must not have");
}

/**
 * Asserts a table is reachable *and* returns nothing — RLS did the refusing.
 *
 * A missing GRANT also produces zero usable rows, but as a 42501, and a table
 * the Data API cannot see at all comes back as PGRST205. Either would satisfy
 * "the member saw no rows" while meaning the app itself is broken, so both are
 * failures here rather than passes.
 */
function mustBeDeniedNotUnreachable(
  label: string,
  error: { code?: string | null; message: string } | null,
  produced: unknown,
) {
  const unreachable = new Set(["42501", "PGRST205", "PGRST125", "PGRST002"]);
  if (error && unreachable.has(error.code ?? "")) {
    bad(label, `not reachable at all (${error.code}) — this proves nothing about RLS`);
  } else if (error) {
    ok(label, `refused — ${error.message.slice(0, 70)}`);
  } else if (Array.isArray(produced) && produced.length === 0) {
    ok(label, "reachable, 0 rows — the grant is present and is_admin() denied");
  } else {
    bad(label, "the member READ this table and must not have");
  }
}

async function cleanup() {
  await service.storage.from("photos").remove([`${TEST_ID}/probe.png`]);
  await service.storage.from("verification-selfies").remove([`${TEST_ID}/probe.png`]);
  await service.from("applications").delete().eq("user_id", TEST_ID);
  await service.from("verifications").delete().eq("user_id", TEST_ID);
  await service.auth.admin.deleteUser(TEST_ID); // profile cascades
}

async function main() {
  console.log(`\nExercising the funnel's writes against ${URL}\n${DIM}${"─".repeat(60)}${RESET}`);

  // Start from a clean slate so a previous interrupted run can't mask a result.
  await cleanup();

  // ---- sign in as a member ------------------------------------------------
  section("Setup");
  {
    const { error } = await service.auth.admin.createUser({
      id: TEST_ID,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      app_metadata: { seed: true },
    });
    if (error) {
      bad("create test user", error.message);
      process.exit(1);
    }
    ok("test user created");
  }

  {
    const { data, error } = await member.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    if (error || !data.session) {
      bad("sign in", error?.message ?? "no session");
      await cleanup();
      process.exit(1);
    }
    ok("signed in", `auth.uid() = ${data.user?.id.slice(0, 13)}…`);
  }

  /*
   * Make sure the season the funnel looks for is there — and leave it alone if
   * it is.
   *
   * `ignoreDuplicates` matters: this used to be a plain upsert, which rewrote
   * the row to the shipped fixture on every run and silently reverted a season
   * put into `live` by `db:seed:remote --live`. Running the verifier would undo
   * the setup for whatever you were about to test, which is a memorable half
   * hour. The check only needs the season to exist.
   */
  {
    const { error } = await service
      .from("seasons")
      .upsert(SEED_SEASON, { onConflict: "id", ignoreDuplicates: true });
    if (error) {
      bad("season present", error.message);
    } else {
      const { data } = await service
        .from("seasons")
        .select("name,phase")
        .eq("id", SEED_SEASON.id)
        .maybeSingle();
      if (data) ok("season present", `${data.name} (${data.phase})`);
      else bad("season present", "not there, and the insert reported no error");
    }
  }

  // ---- storage ------------------------------------------------------------
  section("Storage — photos");
  {
    const { error } = await member.storage
      .from("photos")
      .upload(`${TEST_ID}/probe.png`, PNG, { contentType: "image/png", upsert: false });
    if (error) bad("upload into own folder", error.message);
    else ok("upload into own folder");
  }
  {
    // The policy is `(storage.foldername(name))[1] = auth.uid()::text`. This is
    // the line that stops one member writing into another's folder.
    const { error } = await member.storage
      .from("photos")
      .upload(`${OTHER_ID}/probe.png`, PNG, { contentType: "image/png", upsert: false });
    mustFail("upload into SOMEONE ELSE'S folder", error);
  }

  section("Storage — verification selfies");
  {
    const { error } = await member.storage
      .from("verification-selfies")
      .upload(`${TEST_ID}/probe.png`, PNG, { contentType: "image/png", upsert: false });
    if (error) bad("upload own selfie", error.message);
    else ok("upload own selfie");
  }
  {
    // Storage masks a denied read as "Object not found" so it can't be used to
    // probe for existence. That's correct behaviour, but it makes the negative
    // assertion below meaningless on its own — a file that was never written
    // reads exactly the same. So confirm past RLS that the object is there.
    const { data: listed } = await service.storage
      .from("verification-selfies")
      .list(TEST_ID, { search: "probe.png" });
    const exists = (listed ?? []).some((o) => o.name === "probe.png");
    if (exists) ok("selfie is on disk", "(confirmed with the service role)");
    else bad("selfie is on disk", "nothing was stored — the read test below would be vacuous");

    // Spec §9.8: "review-team eyes only, never shown to members" — including
    // the member who uploaded it.
    const { error } = await member.storage
      .from("verification-selfies")
      .download(`${TEST_ID}/probe.png`);
    mustFail("read back own selfie", error);
  }

  // ---- the funnel's three writes -----------------------------------------
  section("Writes — what the funnel does at submit");
  {
    const { error } = await member.from("profiles").upsert(
      {
        id: TEST_ID,
        first_name: "Probe",
        birthdate: "1994-03-11",
        gender: "nonbinary",
        seeking: ["man", "woman"],
        age_min: 27,
        age_max: 40,
        interests: ["hiking", "cooking", "live music", "films", "cycling"],
        neighborhood: "Grant Park",
        photos: [{ path: `${TEST_ID}/probe.png`, order: 0, approved: false }],
        prompts: [{ prompt_id: "prompt_01", answer: "A probe wrote this." }],
        phone: "+14045550199",
      },
      { onConflict: "id" },
    );
    if (error) bad("insert own profile", error.message);
    else ok("insert own profile");
  }
  {
    const { error } = await member
      .from("verifications")
      .upsert(
        { user_id: TEST_ID, phone_verified_at: new Date().toISOString(), selfie_path: `${TEST_ID}/probe.png` },
        { onConflict: "user_id", ignoreDuplicates: true },
      );
    if (error) bad("insert own verification", error.message);
    else ok("insert own verification");
  }

  let applicationId: string | null = null;
  {
    const { error } = await member
      .from("applications")
      .upsert(
        { user_id: TEST_ID, season_id: SEED_SEASON.id, status: "applied" },
        { onConflict: "user_id,season_id", ignoreDuplicates: true },
      );
    if (error) {
      bad("file own application", error.message);
    } else {
      const { data } = await member
        .from("applications")
        .select("id,status")
        .eq("user_id", TEST_ID)
        .maybeSingle();
      applicationId = data?.id ?? null;
      ok("file own application", `status = ${data?.status}`);
    }
  }

  // ---- what a member must not be able to do -------------------------------
  section("Boundaries — what a member must NOT be able to do");
  {
    const { data, error } = await member.from("profiles").select("id,first_name").eq("id", OTHER_ID);
    mustFail("read another member's profile row", error, data);
  }
  {
    // No client UPDATE policy exists on applications at all — status moves only
    // through the service-role RPC. Self-admission would be the whole game.
    const { data, error } = await member
      .from("applications")
      .update({ status: "admitted" })
      .eq("user_id", TEST_ID)
      .select();
    mustFail("admit their own application", error, data);
  }
  if (applicationId) {
    const { error } = await member.rpc("advance_application", {
      p_application_id: applicationId,
      p_new_status: "admitted",
    });
    mustFail("call advance_application directly", error);
  }
  /*
   * The two admin tables are checked with `mustBeDeniedNotUnreachable`, not
   * `mustFail`.
   *
   * `mustFail` counts any error as a pass, and here that hides the one failure
   * worth catching. If SELECT is not granted to `authenticated`, PostgREST
   * answers 42501 — an error, so `mustFail` reports a healthy boundary — while
   * `adminGate()` reads its own `admin_users` row to decide who is an admin and
   * would lock every admin out of the console. Same shape as the PGRST125 trap
   * in verify-schema.ts: the reassuring result and the broken one look alike.
   *
   * What must happen is *reachable but empty*: the grant is in place and
   * `is_admin()` returns no rows. Migration 0010 makes that grant explicit.
   */
  for (const table of ["admin_users", "admin_audit"] as const) {
    const { data, error } = await member.from(table).select("*").limit(1);
    mustBeDeniedNotUnreachable(`read ${table}`, error, data);
  }

  /*
   * ---- an RPC that actually runs ------------------------------------------
   *
   * `db:verify` proves the privileged functions *exist*, by calling each with
   * deliberate junk and accepting any error that is not PGRST202. That cannot
   * distinguish a healthy guard from a body that fails on every input — and it
   * did not: `respond_connect` and `set_account_paused` both shipped with a
   * CASE of two string literals assigned to an enum column, so accepting a
   * connect and pausing an account were impossible from the day they landed.
   * `0011_enum_assignment_casts.sql` fixes both.
   *
   * `set_account_paused` is the cheapest member-callable RPC with a real
   * effect, so it stands in for the class: if this round trip works, an enum
   * assignment inside a definer function works.
   */
  section("RPCs — do they execute, not just exist?");
  {
    const paused = await member.rpc("set_account_paused", { p_paused: true });
    if (paused.error) {
      bad("pause own account", `${paused.error.message.slice(0, 90)}`);
    } else {
      const { data } = await service
        .from("profiles")
        .select("status")
        .eq("id", TEST_ID)
        .maybeSingle();
      if (data?.status === "paused") ok("pause own account", "status = paused");
      else bad("pause own account", `no error, but status is ${data?.status}`);
    }

    const resumed = await member.rpc("set_account_paused", { p_paused: false });
    if (resumed.error) bad("unpause own account", resumed.error.message.slice(0, 90));
    else ok("unpause own account");
  }

  // ---- the status chain the funnel drives ---------------------------------
  section("Status chain — applied → phone_verified → selfie_submitted → under_review");
  if (applicationId) {
    for (const status of ["phone_verified", "selfie_submitted", "under_review"] as const) {
      const { error } = await service.rpc("advance_application", {
        p_application_id: applicationId,
        p_new_status: status,
      });
      if (error) bad(`advance to ${status}`, error.message);
      else ok(`advance to ${status}`);
    }

    const { data } = await service
      .from("applications")
      .select("status")
      .eq("id", applicationId)
      .maybeSingle();
    if (data?.status === "under_review") ok("final status", "under_review — it would reach the queue");
    else bad("final status", `expected under_review, got ${data?.status}`);
  }

  // ---- teardown -----------------------------------------------------------
  section("Teardown");
  await cleanup();
  const { count } = await service
    .from("applications")
    .select("*", { head: true, count: "exact" })
    .eq("user_id", TEST_ID);
  if ((count ?? 0) === 0) ok("probe data removed");
  else bad("probe data removed", `${count} application row(s) left behind`);

  console.log(`\n${DIM}${"─".repeat(60)}${RESET}`);
  if (failures > 0) {
    console.log(`${RED}${failures} failure(s)${RESET}\n`);
    process.exit(1);
  }
  console.log(`${GREEN}Every write behaved, and every boundary held${RESET}\n`);
}

void main();
