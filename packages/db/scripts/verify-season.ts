/**
 * Does a season ever actually start?
 *
 * Nothing has ever written `seasons.phase`. The application funnel requires
 * `applications_open`; both drop crons filter `phase in ('live','finale_week')`.
 * So a season sat in whatever phase it was created with, forever — and the
 * drop, the mechanic the product is named around, could never begin.
 *
 * `season-tick` is §4.3's last unbuilt job. This drives the real endpoint,
 * because the failure mode is a cron that returns `{ok:true}` having moved
 * nothing.
 *
 *   pnpm --filter @noghost/web dev
 *   pnpm db:verify:season
 *
 * Builds and removes its own seasons. Never touches the seed fixture's.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { SEED_SEASON } from "../src/seed/data";
import { ENV_PATH, loadRepoEnv } from "./env";

loadRepoEnv();

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const CRON = process.env.CRON_SECRET;
if (!URL_ || !SECRET) {
  console.error(`\nNeed Supabase keys in ${ENV_PATH}\n`);
  process.exit(1);
}

const BASE = "http://localhost:3000";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const service: SupabaseClient<any> = createClient(URL_, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", X = "\x1b[0m";
let failures = 0, passed = 0, skipped = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`  ${ok ? G + "✓" : R + "✗"}${X} ${label}${detail ? `  ${D}${detail}${X}` : ""}`);
  if (ok) passed += 1;
  else failures += 1;
}
const section = (t: string) => console.log(`\n${t}`);
const skip = (why: string) => {
  skipped += 1;
  console.log(`  ${D}– skipped: ${why}${X}`);
};

const MEMBER = "deadbeef-0000-4000-8000-000000f5a001";
const MEMBER_EMAIL = "season-probe@noghost.test";
const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

/** Each case is a season whose dates put it somewhere, and what it should do. */
const CASES = [
  {
    key: "starting",
    id: "deadbeef-0000-4000-8000-000000f5b001",
    phase: "pre_season",
    starts_at: days(-1),
    ends_at: days(55),
    expect: "live",
    announces: ["season_start"],
  },
  {
    key: "final week",
    id: "deadbeef-0000-4000-8000-000000f5b002",
    phase: "live",
    starts_at: days(-52),
    ends_at: days(4),
    expect: "finale_week",
    announces: ["season_finale"],
  },
  {
    key: "over",
    id: "deadbeef-0000-4000-8000-000000f5b003",
    phase: "finale_week",
    starts_at: days(-60),
    ends_at: days(-1),
    expect: "closed",
    announces: [],
  },
  {
    key: "locking",
    id: "deadbeef-0000-4000-8000-000000f5b004",
    phase: "applications_open",
    starts_at: days(3),
    ends_at: days(59),
    expect: "pre_season",
    announces: [],
  },
  {
    key: "not due yet",
    id: "deadbeef-0000-4000-8000-000000f5b005",
    phase: "applications_open",
    starts_at: days(30),
    ends_at: days(86),
    expect: "applications_open",
    announces: [],
  },
  {
    // The one a cron must never touch. §7.3 puts publishing behind a confirm
    // gate, and placeholder dates on a sketch must not open applications.
    key: "a draft with live dates",
    id: "deadbeef-0000-4000-8000-000000f5b006",
    phase: "draft",
    starts_at: days(-10),
    ends_at: days(46),
    expect: "draft",
    announces: [],
  },
  {
    // An admin closed it early. A tick with a clock must not overrule a person.
    key: "closed early by a human",
    id: "deadbeef-0000-4000-8000-000000f5b007",
    phase: "closed",
    starts_at: days(-10),
    ends_at: days(46),
    expect: "closed",
    announces: [],
  },
  {
    // Missed ticks: never told it started, and now it is nearly over.
    key: "behind by two phases",
    id: "deadbeef-0000-4000-8000-000000f5b008",
    phase: "pre_season",
    starts_at: days(-53),
    ends_at: days(3),
    expect: "finale_week",
    announces: ["season_start", "season_finale"],
  },
] as const;

const tick = async () =>
  (await fetch(`${BASE}/api/cron/season-tick`, {
    headers: { authorization: `Bearer ${CRON}` },
  })).json();

async function teardown() {
  const ids = CASES.map((c) => c.id);
  await service.from("notifications").delete().eq("user_id", MEMBER);
  await service.from("season_members").delete().in("season_id", ids);
  await service.from("profiles").delete().eq("id", MEMBER);
  await service.from("seasons").delete().in("id", ids);

  const { data: page } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const user of page?.users ?? []) {
    if (user.email === MEMBER_EMAIL) {
      await service.from("profiles").delete().eq("id", user.id);
      await service.auth.admin.deleteUser(user.id).catch(() => {});
    }
  }
  await service.auth.admin.deleteUser(MEMBER).catch(() => {});
}

async function setup() {
  const { error: userError } = await service.auth.admin.createUser({
    id: MEMBER,
    email: MEMBER_EMAIL,
    password: "probe-only-not-a-real-account-a4e2",
    email_confirm: true,
    app_metadata: { seed: true },
  });
  if (userError) throw new Error(`user: ${userError.message}`);

  const { error: profileError } = await service.from("profiles").insert({
    id: MEMBER,
    first_name: "Season probe",
    birthdate: "1990-06-06",
    gender: "woman",
    seeking: ["man"],
    status: "active",
  });
  if (profileError) throw new Error(`profile: ${profileError.message}`);

  for (const c of CASES) {
    const { error } = await service.from("seasons").insert({
      ...SEED_SEASON,
      id: c.id,
      name: `Season probe — ${c.key}`,
      phase: c.phase,
      applications_open_at: days(-90),
      starts_at: c.starts_at,
      ends_at: c.ends_at,
      created_at: days(-100),
    });
    if (error) throw new Error(`season ${c.key}: ${error.message}`);

    // One paid member in every season, so an announcement has somewhere to go.
    const { error: memberError } = await service.from("season_members").insert({
      user_id: MEMBER,
      season_id: c.id,
      stripe_payment_intent: `pi_deadbeef_season_${c.id.slice(-4)}`,
      price_paid_cents: SEED_SEASON.price_standard_cents,
    });
    if (memberError) throw new Error(`member ${c.key}: ${memberError.message}`);
  }
}

const notifications = async (template: string, seasonId: string) =>
  ((
    await service
      .from("notifications")
      .select("id,channel,payload")
      .eq("user_id", MEMBER)
      .eq("template", template)
  ).data ?? []).filter(
    (row) => (row.payload as { season_id?: string })?.season_id === seasonId,
  );

async function main() {
  console.log("\nSeasons — does one ever actually start?");

  await teardown();
  await setup();

  /*
   * Reachability is probed against the home page, NOT against the cron
   * endpoint. Hitting the endpoint to see whether it answers *runs the job* —
   * which it did, and the first real tick then reported `"moved":[]` because
   * the probe had already moved everything. The checks still passed, on work
   * done by a line that was only supposed to be asking a question.
   */
  const up = await fetch(BASE).then((r) => r.ok, () => false);

  try {
    if (!CRON) {
      section("The tick");
      skip("CRON_SECRET is not set");
    } else if (!up) {
      section("The tick");
      skip(`no dev server on ${BASE} — run: pnpm --filter @noghost/web dev`);
    } else {
      section("Where the calendar says each season should be");
      const result = (await tick()) as { ok?: boolean; moved?: unknown[] };
      console.log(`  ${D}${JSON.stringify(result).slice(0, 300)}${X}`);

      if (!result.ok) {
        skip("the tick refused the request — check CRON_SECRET");
      }

      for (const c of CASES) {
        const { data } = await service.from("seasons").select("phase").eq("id", c.id).single();
        check(data?.phase === c.expect, `${c.key} → ${c.expect}`, data?.phase ?? "gone");
      }

      section("What the cohort was told");
      for (const c of CASES) {
        for (const template of ["season_start", "season_finale"] as const) {
          const expected = (c.announces as readonly string[]).includes(template) ? 2 : 0;
          const rows = await notifications(template, c.id);
          check(
            rows.length === expected,
            `${c.key}: ${expected === 0 ? `no ${template}` : `${template} on push and email`}`,
            `${rows.length} row(s)`,
          );
        }
      }

      {
        const rows = await notifications("season_start", CASES[7]!.id);
        check(
          rows.length === 2,
          "a season behind by two phases still announces the start it never sent",
          `${rows.length} row(s)`,
        );
      }

      section("Running it again");
      await tick();
      for (const c of CASES) {
        const { data } = await service.from("seasons").select("phase").eq("id", c.id).single();
        if (data?.phase !== c.expect) {
          check(false, `${c.key} moved on a second tick`, data?.phase ?? "gone");
        }
      }
      check(true, "no season moved twice");

      const start = await notifications("season_start", CASES[0]!.id);
      check(start.length === 2, "and nobody was told twice", `${start.length} row(s)`);
    }
  } finally {
    section("Teardown");
    await teardown();
    console.log(`  ${D}probe seasons removed${X}`);
  }

  const tail = skipped > 0 ? ` ${D}(${skipped} section(s) skipped)${X}` : "";
  if (failures > 0) console.log(`\n${R}${failures} check(s) failed${X}${tail}\n`);
  else if (passed === 0)
    console.log(`\n${R}Nothing was verified${X} — every section skipped. This is not a pass.\n`);
  else console.log(`\n${G}${passed} check(s) passed${X}${tail}\n`);

  process.exit(failures === 0 && passed > 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n${R}${error instanceof Error ? error.message : String(error)}${X}\n`);
  process.exit(1);
});
