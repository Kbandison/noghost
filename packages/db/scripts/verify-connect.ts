/**
 * Does an unanswered note ever get an answer?
 *
 * Two mechanics §6.2 specifies and nothing implemented. `needsNudge` and
 * `expireConnect` have been in `packages/logic` since the connect flow was
 * built, unit-tested, with zero callers — and 0003 carries a partial index
 * built for the query nobody wrote. Worse, `connect_status` has an `'expired'`
 * value nothing ever set, so a note still pending when a season ended left its
 * sender with no answer at all. In a product whose pitch is "nobody gets
 * ghosted", that was the one ghost still possible.
 *
 * `connect-sweep` closes both. This drives the real endpoint against the real
 * database, because the failure mode is a cron that returns `{ok:true}` having
 * done nothing.
 *
 *   pnpm --filter @noghost/web dev
 *   pnpm db:verify:connect
 *
 * Builds and removes its own world, including its own seasons — one already
 * ended, one still running — so nothing depends on the seed fixture's dates.
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
let failures = 0;
let passed = 0;
let skipped = 0;
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

/*
 * S sends; R1..R3 receive. Three recipients rather than one because `connects`
 * is `unique (from_user, to_user, season_id)` — one shot per pair per season —
 * so every case below needs a partner of its own.
 */
const PEOPLE = [
  { key: "S", id: "deadbeef-0000-4000-8000-0000000c5001", name: "Connect S" },
  { key: "R1", id: "deadbeef-0000-4000-8000-0000000c5002", name: "Connect R1" },
  { key: "R2", id: "deadbeef-0000-4000-8000-0000000c5003", name: "Connect R2" },
  { key: "R3", id: "deadbeef-0000-4000-8000-0000000c5004", name: "Connect R3" },
] as const;

const LIVE_SEASON = "deadbeef-0000-4000-8000-0000000c5901";
const ENDED_SEASON = "deadbeef-0000-4000-8000-0000000c5902";
const email = (key: string) => `connect-probe-${key.toLowerCase()}@noghost.test`;

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const sweep = async () =>
  (await fetch(`${BASE}/api/cron/connect-sweep`, {
    headers: { authorization: `Bearer ${CRON}` },
  })).json();

async function teardown() {
  const ids = PEOPLE.map((p) => p.id);
  await service.from("notifications").delete().in("user_id", ids);
  await service.from("connects").delete().in("from_user", ids);
  await service.from("drop_cards").delete().in("shown_profile_id", ids);
  await service.from("drops").delete().in("user_id", ids);
  await service.from("profiles").delete().in("id", ids);
  await service.from("seasons").delete().in("id", [LIVE_SEASON, ENDED_SEASON]);

  const wanted = new Set(PEOPLE.map((p) => email(p.key)));
  const { data: page } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const user of page?.users ?? []) {
    if (user.email && wanted.has(user.email)) {
      await service.from("profiles").delete().eq("id", user.id);
      await service.auth.admin.deleteUser(user.id).catch(() => {});
    }
  }
  for (const person of PEOPLE) await service.auth.admin.deleteUser(person.id).catch(() => {});
}

async function setup() {
  for (const [id, ends] of [
    [LIVE_SEASON, new Date(Date.now() + 30 * 86_400_000).toISOString()],
    [ENDED_SEASON, hoursAgo(48)],
  ] as const) {
    const { error } = await service.from("seasons").insert({
      ...SEED_SEASON,
      id,
      name: `Connect probe ${id.slice(-4)}`,
      phase: "live",
      applications_open_at: hoursAgo(24 * 90),
      starts_at: hoursAgo(24 * 60),
      ends_at: ends,
      created_at: hoursAgo(24 * 100),
    });
    if (error) throw new Error(`season ${id.slice(-4)}: ${error.message}`);
  }

  for (const person of PEOPLE) {
    const { error } = await service.auth.admin.createUser({
      id: person.id,
      email: email(person.key),
      password: "probe-only-not-a-real-account-a4e2",
      email_confirm: true,
      app_metadata: { seed: true },
    });
    if (error) throw new Error(`create ${person.key}: ${error.message}`);

    const { error: profileError } = await service.from("profiles").insert({
      id: person.id,
      first_name: person.name,
      birthdate: "1990-06-06",
      gender: "woman",
      seeking: ["man"],
      status: "active",
    });
    if (profileError) throw new Error(`profile ${person.key}: ${profileError.message}`);
  }
}

/**
 * Each connect needs a drop card to hang off — `drop_card_id` is not null — and
 * `drops` is unique on (user, season, drop_date), so every call needs its own
 * day as well as its own recipient.
 */
let dropDay = 0;
async function makeConnect(
  seasonId: string,
  toUser: string,
  createdAt: string,
  status = "pending",
) {
  const [s] = PEOPLE;
  dropDay += 1;
  const { data: drop, error: dropError } = await service
    .from("drops")
    .insert({
      season_id: seasonId,
      user_id: s!.id,
      drop_date: new Date(Date.now() - dropDay * 86_400_000).toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  if (dropError) throw new Error(`drop: ${dropError.message}`);

  const { data: card, error: cardError } = await service
    .from("drop_cards")
    .insert({ drop_id: drop.id, shown_profile_id: toUser, action: "connected" })
    .select("id")
    .single();
  if (cardError) throw new Error(`card: ${cardError.message}`);

  const { data, error } = await service
    .from("connects")
    .insert({
      season_id: seasonId,
      from_user: s!.id,
      to_user: toUser,
      drop_card_id: card.id,
      prompt_ref: { type: "prompt", id: "prompt_01" },
      reply_text: "Connect probe.",
      status,
      created_at: createdAt,
      responded_at: status === "pending" ? null : createdAt,
    })
    .select("id")
    .single();
  if (error) throw new Error(`connect: ${error.message}`);
  return data.id as string;
}

const notificationsFor = async (userId: string, template: string) =>
  (
    await service
      .from("notifications")
      .select("id,template,channel,payload")
      .eq("user_id", userId)
      .eq("template", template)
  ).data ?? [];

async function main() {
  console.log("\nConnects — does an unanswered note ever get an answer?");

  await teardown();
  await setup();

  // The home page, not the cron endpoint: probing the endpoint would run the
  // sweep, and a reachability check must not be one of the things being tested.
  const up = await fetch(BASE).then((r) => r.ok, () => false);

  try {
    const [s, r1, r2, r3] = PEOPLE;

    if (!CRON) {
      section("The sweep");
      skip("CRON_SECRET is not set");
    } else if (!up) {
      section("The sweep");
      skip(`no dev server on ${BASE} — run: pnpm --filter @noghost/web dev`);
    } else {
      // -------------------------------------------------------------------
      section("The single nudge, at 72 hours — §6.2");

      const old = await makeConnect(LIVE_SEASON, r1!.id, hoursAgo(73));
      const young = await makeConnect(LIVE_SEASON, r2!.id, hoursAgo(71));
      const answered = await makeConnect(LIVE_SEASON, r3!.id, hoursAgo(100), "accepted");

      const first = await sweep();
      console.log(`  ${D}${JSON.stringify(first)}${X}`);

      {
        const notes = await notificationsFor(r1!.id, "connect_nudge");
        check(notes.length === 1, "the recipient is nudged once", `${notes.length} note(s)`);
        check(
          (notes[0]?.payload as { connect_id?: string })?.connect_id === old,
          "about the note that has been waiting",
        );
      }

      {
        // §6.2: never shown to the sender. Telling them their note is unread
        // is pressure, not information.
        const notes = await notificationsFor(s!.id, "connect_nudge");
        check(notes.length === 0, "and the sender is never told theirs is unread", `${notes.length} note(s)`);
      }

      {
        const { data } = await service.from("connects").select("nudged_at").eq("id", old).single();
        check(Boolean(data?.nudged_at), "the row is stamped, which is what makes it once");
      }

      {
        const { data } = await service.from("connects").select("nudged_at").eq("id", young).single();
        check(!data?.nudged_at, "a note from 71 hours ago is left alone");
      }

      {
        const { data } = await service
          .from("connects")
          .select("nudged_at,status")
          .eq("id", answered)
          .single();
        check(!data?.nudged_at, "and an answered one is never nudged", data?.status ?? "");
      }

      {
        await sweep();
        const notes = await notificationsFor(r1!.id, "connect_nudge");
        check(notes.length === 1, "a second sweep does not nudge again — §3.3 bans nagging", `${notes.length} note(s)`);
      }

      // -------------------------------------------------------------------
      section("The answer a sender is owed when the season ends — §6.2");

      const stranded = await makeConnect(ENDED_SEASON, r1!.id, hoursAgo(100));

      const second = await sweep();
      console.log(`  ${D}${JSON.stringify(second)}${X}`);

      {
        const { data } = await service
          .from("connects")
          .select("status,responded_at")
          .eq("id", stranded)
          .single();
        check(data?.status === "expired", "the connect is expired, not left pending", data?.status ?? "");
        check(Boolean(data?.responded_at), "with a time on it, like every other ending");
      }

      {
        const notes = await notificationsFor(s!.id, "connect_declined");
        check(notes.length === 1, "the sender is told", `${notes.length} note(s)`);
        const payload = notes[0]?.payload as { template_id?: string } | undefined;
        check(
          payload?.template_id === "expired_auto",
          "with the expiry note, NOT the decline",
          payload?.template_id ?? "none",
        );
        // The distinction this whole check exists for: `decline_auto` says they
        // "read your note and isn't able to connect". Nobody read it.
        check(
          payload?.template_id !== "decline_auto",
          "because nobody read it, and saying they did invents a decision",
        );
        check(notes[0]?.channel === "inapp", "in-app, where the inbox renders it", notes[0]?.channel ?? "");
      }

      {
        const { data } = await service.from("connects").select("status").eq("id", old).single();
        check(data?.status === "pending", "a live season's connect is untouched", data?.status ?? "");
      }

      {
        await sweep();
        const notes = await notificationsFor(s!.id, "connect_declined");
        check(notes.length === 1, "and a second sweep expires nothing twice", `${notes.length} note(s)`);
      }

      {
        /*
         * The stranded note was 100 hours old, so it was eligible for a nudge
         * as well as for expiry. Running nudges first sent its recipient
         * "they deserve an answer either way" about a connect the same sweep
         * was closing — chasing somebody for an answer they could no longer
         * give. Expiry runs first now, and this is what holds that.
         */
        const notes = await notificationsFor(r1!.id, "connect_nudge");
        check(
          notes.length === 1,
          "nobody is nudged about a note the same sweep expired",
          `${notes.length} nudge(s) to R1 — 1 is the live-season note from earlier`,
        );
        const { data } = await service
          .from("connects")
          .select("nudged_at")
          .eq("id", stranded)
          .single();
        check(!data?.nudged_at, "the expired note was never nudged at all");
      }
    }
  } finally {
    section("Teardown");
    await teardown();
    console.log(`  ${D}probe world removed${X}`);
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
