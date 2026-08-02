/**
 * Does the applied database match what the code expects?
 *
 * The migrations are applied by hand (dashboard SQL editor or CLI), and a
 * partial apply is the dangerous failure: every table still exists and writes
 * still succeed, they just quietly stop being protected. `0006_rls.sql` and
 * `0007_rpcs.sql` are where the product's actual guarantees live.
 *
 * So this checks three separate things, in increasing order of importance:
 *
 *   1. Structure  — tables, views and buckets exist.
 *   2. Reachability — the Data API can see them (a missing GRANT reads exactly
 *      like an empty table, which is the worst possible failure mode).
 *   3. Security   — anon is actually *denied*. This is the only class of check
 *      that can fail while the app looks completely healthy.
 *
 * Run: pnpm db:verify
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------- env

const ENV_PATH = resolve(process.cwd(), "apps/web/.env.local");

if (existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;

if (!URL || !PUBLISHABLE || !SECRET) {
  console.error(
    `\nMissing Supabase credentials.\n\n` +
      `Expected NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and\n` +
      `SUPABASE_SECRET_KEY in ${ENV_PATH}\n` +
      `(or in the environment). See .env.example.\n`,
  );
  process.exit(1);
}

/**
 * The project URL must be the bare origin. supabase-js appends `/rest/v1`,
 * `/storage/v1` and `/auth/v1` itself, so a trailing path produces
 * `/rest/v1/rest/v1/...` and every single request fails with PGRST125.
 *
 * That failure is far more dangerous than it looks: a security check that
 * reads "anon was denied" is indistinguishable from one that reads "the URL
 * was malformed" unless you look at the code. Caught exactly that way once.
 */
{
  const parsed = new globalThis.URL(URL);
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    console.error(
      `\nNEXT_PUBLIC_SUPABASE_URL must be the bare project origin.\n\n` +
        `  got:      ${URL}\n` +
        `  expected: ${parsed.origin}\n\n` +
        `supabase-js appends /rest/v1, /auth/v1 and /storage/v1 on its own.\n`,
    );
    process.exit(1);
  }
}

/**
 * Untyped on purpose. This script probes tables by name from a list, which the
 * generated `Database` type correctly refuses to allow — the whole point here
 * is to find out whether reality matches that type, so it can't be the thing
 * doing the checking.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const service: SupabaseClient<any> = createClient(URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anon: SupabaseClient<any> = createClient(URL, PUBLISHABLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------- expectations

/** Every `create table` in supabase/migrations, in dependency order. */
const TABLES = [
  "admin_users",
  "profiles",
  "verifications",
  "seasons",
  "applications",
  "season_members",
  "drops",
  "drop_cards",
  "connects",
  "chats",
  "messages",
  "dates",
  "date_checkins",
  "closure_notes",
  "graduations",
  "exit_surveys",
  "reports",
  "waitlist",
  "notifications",
  "notification_prefs",
  "admin_audit",
  "processed_webhook_events",
];

const VIEWS = ["public_season_stats", "visible_profiles"];

const BUCKETS = [
  { id: "photos", public: true },
  { id: "voice-notes", public: false },
  { id: "verification-selfies", public: false },
];

/**
 * Tables anon must never read. `profiles` is the one that matters most — it is
 * the whole cohort's PII, and it is readable by design *only* through the
 * `visible_profiles` definer view.
 */
const ANON_DENIED = [
  "profiles",
  "verifications",
  "applications",
  "season_members",
  "messages",
  "chats",
  "closure_notes",
  "reports",
  "waitlist",
  "admin_users",
  "admin_audit",
];

/** Anon's entire legitimate surface: the marketing seat counter. */
const ANON_ALLOWED = ["public_season_stats"];

/**
 * Probed with a deliberately invalid first argument, so Postgres fails during
 * argument coercion and the function body never runs. Existence without side
 * effects — `report_member` would otherwise file a report.
 */
const MEMBER_RPCS: [string, Record<string, unknown>][] = [
  ["pass_card", { p_card_id: "not-a-uuid" }],
  ["send_connect", { p_card_id: "not-a-uuid", p_prompt_ref: {} }],
  ["respond_connect", { p_connect_id: "not-a-uuid", p_accept: true }],
  ["propose_date", { p_chat_id: "not-a-uuid", p_scheduled_for: "x", p_place_name: "" }],
  ["respond_to_date", { p_date_id: "not-a-uuid", p_confirm: true }],
  ["cancel_date", { p_date_id: "not-a-uuid" }],
  ["answer_checkin", { p_date_id: "not-a-uuid", p_answer: "continue" }],
  ["close_chat", { p_chat_id: "not-a-uuid", p_template_id: "" }],
  ["propose_graduation", { p_chat_id: "not-a-uuid" }],
  ["respond_graduation", { p_graduation_id: "not-a-uuid", p_confirm: true }],
  ["set_account_paused", { p_paused: "not-a-boolean" }],
  ["report_member", { p_reported_id: "not-a-uuid", p_reason: "" }],
];

/** Service-role and admin only — `revoke execute ... from public, anon, authenticated`. */
const PRIVILEGED_RPCS: [string, Record<string, unknown>][] = [
  ["advance_application", { p_application_id: "not-a-uuid", p_new_status: "admitted" }],
  ["audit", { p_action: "probe", p_table: "probe", p_target: "not-a-uuid" }],
  ["enqueue_notification", { p_user: "not-a-uuid", p_channel: "push", p_template: "probe" }],
];

// ---------------------------------------------------------------- reporting

let failures = 0;
let warnings = 0;

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function pass(label: string, detail = "") {
  console.log(`  ${GREEN}✓${RESET} ${label}${detail ? ` ${DIM}${detail}${RESET}` : ""}`);
}
function fail(label: string, detail: string) {
  failures += 1;
  console.log(`  ${RED}✗${RESET} ${label}\n      ${RED}${detail}${RESET}`);
}
function warn(label: string, detail: string) {
  warnings += 1;
  console.log(`  ${YELLOW}!${RESET} ${label}\n      ${YELLOW}${detail}${RESET}`);
}
function section(title: string) {
  console.log(`\n${title}`);
}

/** PostgREST/Postgres codes that mean "this function is not there". */
const MISSING_FN = new Set(["PGRST202", "42883"]);
/** ...and the ones that mean "there, but you may not call it". */
const DENIED = new Set(["42501", "PGRST301", "PGRST302"]);

/**
 * Codes that mean the request never reached the thing under test — a bad URL,
 * a stale schema cache, an unparseable query.
 *
 * These must never count as a pass. A malformed URL "denies" anon exactly as
 * convincingly as a correct RLS policy does, and the first run of this script
 * reported a fully green security section for a database it had never actually
 * talked to.
 */
const TRANSPORT = new Set(["PGRST125", "PGRST002", "PGRST100", "PGRST121"]);
const isTransport = (code?: string | null) => TRANSPORT.has(code ?? "");

// ---------------------------------------------------------------- checks

async function checkStructure() {
  section("Structure — tables");
  for (const table of TABLES) {
    // `head: true` returns a count and no rows, so this touches no data.
    const { error } = await service.from(table).select("*", { head: true, count: "exact" });
    if (error) fail(table, `${error.code ?? "?"} ${error.message}`);
    else pass(table);
  }

  section("Structure — views");
  for (const view of VIEWS) {
    const { error } = await service.from(view).select("*", { head: true, count: "exact" });
    if (error) fail(view, `${error.code ?? "?"} ${error.message}`);
    else pass(view);
  }

  section("Structure — storage buckets");
  const { data: buckets, error } = await service.storage.listBuckets();
  if (error) {
    fail("listBuckets", error.message);
    return;
  }
  for (const expected of BUCKETS) {
    const found = buckets?.find((b) => b.id === expected.id);
    if (!found) {
      fail(expected.id, "bucket missing — 0008_storage.sql did not apply");
    } else if (found.public !== expected.public) {
      // A private bucket flipped public would expose every verification selfie.
      fail(
        expected.id,
        `public flag is ${found.public}, expected ${expected.public}` +
          (expected.public ? "" : " — selfies would be world-readable"),
      );
    } else {
      pass(expected.id, expected.public ? "(public)" : "(private)");
    }
  }
}

async function checkSecurity() {
  section("Security — anon must be denied");
  for (const table of ANON_DENIED) {
    // What's actually in there, read past RLS. Without this, "anon saw 0 rows"
    // is unfalsifiable — an empty table looks exactly like a working policy.
    const { count } = await service.from(table).select("*", { head: true, count: "exact" });
    const populated = (count ?? 0) > 0;

    const { data, error } = await anon.from(table).select("*", { head: false }).limit(1);

    if (error && isTransport(error.code)) {
      fail(table, `never reached the table (${error.code}) — this proves nothing about RLS`);
    } else if (error) {
      // Permission denied outright — the strongest outcome, and it holds
      // whether or not the table has anything in it.
      pass(table, `denied (${error.code ?? "?"})`);
    } else if (data && data.length > 0) {
      fail(
        table,
        `anon read ${data.length} row(s). RLS is off, a policy is too broad, ` +
          `or the table is granted to anon.`,
      );
    } else if (populated) {
      // Zero rows out of a table that demonstrably has rows. That's RLS.
      pass(table, `0 of ${count} rows visible to anon`);
    } else {
      warn(table, "empty table — anon saw nothing, but nothing was there to see");
    }
  }

  section("Security — anon's legitimate surface");
  for (const view of ANON_ALLOWED) {
    const { error } = await anon.from(view).select("*", { head: true, count: "exact" });
    if (error) fail(view, `anon cannot read it: ${error.code ?? "?"} ${error.message}`);
    else pass(view, "readable");
  }
}

async function checkRpcs() {
  section("RPCs — member functions exist and are granted to authenticated");
  for (const [name, args] of MEMBER_RPCS) {
    const { error } = await service.rpc(name, args);
    if (error && isTransport(error.code)) {
      fail(name, `never reached the function (${error.code})`);
    } else if (error && MISSING_FN.has(error.code ?? "")) {
      // PostgREST resolves by name *and* parameter names, so this also fires
      // when the probe above is out of date with the migration. Check the
      // signature before concluding the migration is at fault.
      fail(
        name,
        `no function matched (${error.code}) — either 0007_rpcs.sql did not fully ` +
          `apply, or this probe's argument names drifted from the signature`,
      );
    } else {
      // Any other error means the function resolved and rejected our bad
      // argument, which is exactly what we want.
      pass(name, error ? `exists (rejected probe: ${error.code})` : "exists");
    }
  }

  section("RPCs — privileged functions must be unreachable by anon");
  for (const [name, args] of PRIVILEGED_RPCS) {
    const { error: svcError } = await service.rpc(name, args);
    if (svcError && isTransport(svcError.code)) {
      fail(name, `never reached the function (${svcError.code})`);
    } else if (svcError && MISSING_FN.has(svcError.code ?? "")) {
      // Worth calling out specifically: `revoke execute ... from public` can
      // strip service_role too if its grant came via PUBLIC rather than
      // Supabase's default privileges. The admin app depends on this working.
      fail(name, `service role cannot call it (${svcError.code}) — admin app would break`);
    } else {
      pass(name, "callable by service role");
    }

    const { error: anonError } = await anon.rpc(name, args);
    if (!anonError) {
      fail(`${name} (anon)`, "anon executed a privileged function");
    } else if (isTransport(anonError.code)) {
      fail(`${name} (anon)`, `never reached the function (${anonError.code}) — proves nothing`);
    } else if (MISSING_FN.has(anonError.code ?? "") || DENIED.has(anonError.code ?? "")) {
      pass(`${name} (anon)`, `blocked (${anonError.code})`);
    } else {
      fail(
        `${name} (anon)`,
        `reached the function body and failed on arguments instead of privileges (${anonError.code}) — ` +
          `the revoke did not take`,
      );
    }
  }
}

async function checkData() {
  section("Data — is there anything to apply to?");

  const { data: seasons, error } = await service
    .from("seasons")
    .select("id,name,city,phase,starts_at,member_cap")
    .order("starts_at", { ascending: true });

  if (error) {
    fail("seasons", `${error.code ?? "?"} ${error.message}`);
    return;
  }
  if (!seasons || seasons.length === 0) {
    warn(
      "seasons",
      "no season rows. The funnel cannot file an application without one — " +
        "run supabase/seed.sql, or create the real season in the admin console.",
    );
    return;
  }
  for (const s of seasons) {
    pass(`season "${s.name}"`, `${s.city} · ${s.phase} · cap ${s.member_cap}`);
  }

  const { count } = await service.from("profiles").select("*", { head: true, count: "exact" });
  pass("profiles", `${count ?? 0} row(s)`);
}

// ---------------------------------------------------------------- run

async function main() {
  console.log(`\nVerifying ${URL}\n${DIM}${"─".repeat(60)}${RESET}`);

  await checkStructure();
  await checkSecurity();
  await checkRpcs();
  await checkData();

  console.log(`\n${DIM}${"─".repeat(60)}${RESET}`);
  if (failures > 0) {
    console.log(`${RED}${failures} failure(s)${RESET}, ${warnings} warning(s)\n`);
    console.log(
      `A failure here means a migration did not fully apply. Re-run the file it\n` +
        `belongs to — every migration is written to be idempotent.\n`,
    );
    process.exit(1);
  }
  console.log(`${GREEN}All checks passed${RESET}${warnings ? `, ${warnings} warning(s)` : ""}\n`);
}

void main();
