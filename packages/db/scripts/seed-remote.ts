/**
 * Seed a *remote* Supabase project over the API.
 *
 * `supabase/seed.sql` is the local-development artefact — it writes straight
 * into `auth.users`, which only the SQL editor or a direct connection can do.
 * This script does the same work through the admin API instead, so a hosted
 * project can be seeded (and re-seeded, and purged) without anyone pasting a
 * thousand lines into a dashboard.
 *
 * Both read the same generator in src/seed/data.ts, so they cannot drift.
 *
 * Every row it writes has an id beginning `deadbeef-`, and `--purge` removes
 * exactly those. Nothing here should ever run against production.
 *
 *   pnpm db:seed:remote
 *   pnpm db:seed:remote --applications
 *   pnpm db:seed:remote --members
 *   pnpm db:seed:remote --live
 *   pnpm db:seed:remote --chats
 *   pnpm db:seed:remote --for you@example.com      one real account, every screen
 *   pnpm db:seed:remote --for you@example.com --purge-for
 *   pnpm db:seed:remote --purge
 */

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Database } from "@noghost/types";
import { dropDateFor, phaseForDate } from "@noghost/logic";
import { SEED_SEASON, generateSeedProfiles, isSeedId, seedId } from "../src/seed/data";
import { ENV_PATH, loadRepoEnv } from "./env";

loadRepoEnv();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;

if (!URL || !SECRET) {
  console.error(`\nNeed NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in ${ENV_PATH}\n`);
  process.exit(1);
}

const db = createClient<Database>(URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PROFILES = generateSeedProfiles();
const purging = process.argv.includes("--purge");
/** Also file applications (with media) so the admissions queue has work in it. */
const withApplications = process.argv.includes("--applications");
/** Enough to exercise the queue, few enough to seed in seconds. */
const APPLICANT_COUNT = 12;

/**
 * Also give the seeded profiles a `season_members` row.
 *
 * Membership is normally written by the Stripe webhook, so until that account
 * exists there is no way to get a single member into a season — and the drop
 * algorithm, the fuse and everything downstream of them have nobody to run
 * against. `stripe_payment_intent` is `not null unique`, so the fixture rows
 * carry an obviously-fake `pi_deadbeef_…` value that could never collide with
 * a real intent id.
 */
const withMembers = process.argv.includes("--members");

/**
 * Also move the seeded season into a state where drops actually run.
 *
 * `isSeasonServing` requires phase `live` and `now` inside starts_at..ends_at,
 * which the shipped fixture deliberately is not — it is configured as the real
 * upcoming season for the marketing site. This backdates day one so the season
 * is mid-flight, which is the only way to exercise `generate-drops` before
 * October. Implies `--members`; a live season with no members is not a season.
 *
 * It changes what the marketing hero says. `--purge` puts it back by removing
 * the season entirely, and re-seeding without the flag restores the fixture.
 */
/*
 * `--for` implies this, and finding out why cost a run.
 *
 * `seed()` upserts the season fixture every time, so any run resets `phase` AND
 * `starts_at` to the shipped October dates. Seeding somebody's member app
 * therefore switched the season off underneath them — including, on the run
 * that found this, throwing away a day-one date somebody had set by hand to
 * test with. Tonight then said "Not yet" over a drop that existed.
 *
 * A member app you cannot walk is the exact problem `--for` exists to solve, so
 * it takes the season with it.
 */
const goLive =
  process.argv.includes("--live") ||
  process.argv.includes("--chats") ||
  process.argv.includes("--for");

/** Day one, relative to the run, when `--live` is used. Mid-week-two. */
const LIVE_STARTED_DAYS_AGO = 9;

/**
 * Also seed chats sitting at every position on the fuse.
 *
 * `fuse-sweep` cannot be exercised without them, and they cannot be created the
 * normal way yet: `respond_connect` is how a chat comes into existence, and it
 * is broken until `0011_enum_assignment_casts.sql` is applied. Even once it is,
 * a chat 20 hours from expiry is not something you can reach by clicking — you
 * would wait six days. So these are written directly, with deadlines chosen to
 * land one chat in each branch of the state machine.
 *
 * Implies `--live`. The rows live on their own `drop_date` (day one) so they can
 * never collide with, or be cleaned up by, a real drop.
 */
const withChats = process.argv.includes("--chats");

/**
 * Wire a REAL member into the fixtures, so the member app can be walked.
 *
 *   pnpm db:seed:remote --for you@example.com
 *   pnpm db:seed:remote --for <uuid> --purge-for
 *
 * Everything above seeds a cohort that talks to itself. That exercises the
 * crons and the verifiers and shows you nothing: sign in as yourself and the
 * Inbox is empty, Tonight has no drop, and there is no way to see a fuse ring
 * or a note waiting without waiting days for one to arrive.
 *
 * This gives one named account a note to answer, four conversations at
 * different points on their fuses, a declined note, a closed chat and a
 * released drop — every state the app can show, in one sitting.
 *
 * Two rules make it safe to point at a live account:
 *
 *   1. The target is always an explicit argument. There is no default, no
 *      "first member found", and no run without one.
 *   2. Every row it writes pairs the target with a `deadbeef-` seed profile, and
 *      `--purge-for` deletes exactly those pairings. It can add fixtures to a
 *      real account and it cannot touch that account's real conversations,
 *      because a real one has a real person on the other side.
 */
const forIndex = process.argv.indexOf("--for");
const forTarget = forIndex === -1 ? null : process.argv[forIndex + 1] ?? null;
const purgingFor = process.argv.includes("--purge-for");

/** The seeded members' throwaway logins. Never used to sign in. */
const emailFor = (id: string) => `seed-${id.slice(-4)}@noghost.test`;

/**
 * A flat coloured tile with an initial on it.
 *
 * Deliberately abstract. The admissions screen needs *something* in the photo
 * grid and the selfie frame to be reviewable at all, but generating
 * face-like images — or pulling them from a placeholder-people service — would
 * put pictures of real or synthetic humans into a dating product's review
 * queue. A reviewer can tell at a glance that these are fixtures.
 *
 * Deterministic: same profile, same colours, every run.
 */
async function tile(seed: string, initial: string, variant: number): Promise<Buffer> {
  let hash = 0;
  for (const ch of `${seed}:${variant}`) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;

  const hue = hash % 360;
  const bg = `hsl(${hue} 38% ${variant === 0 ? 46 : 62}%)`;
  const fg = `hsl(${hue} 45% 96%)`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800">
    <rect width="640" height="800" fill="${bg}"/>
    <text x="320" y="470" font-family="Georgia,serif" font-size="300" font-weight="700"
          fill="${fg}" text-anchor="middle" opacity="0.85">${initial}</text>
    <text x="320" y="620" font-family="Helvetica,sans-serif" font-size="34"
          fill="${fg}" text-anchor="middle" opacity="0.7" letter-spacing="6">FIXTURE</text>
  </svg>`;

  /*
   * JPEG, not WebP.
   *
   * 0035 narrowed both the `photos` and `verification-selfies` buckets to
   * `image/jpeg` and `image/png`, because Rekognition reads only those two and
   * a WebP upload meant a photo nothing could screen. Storage then started
   * refusing these tiles with "mime type image/webp is not supported" — which
   * `seedPhotos` logged and swallowed, so every re-seed reported success while
   * leaving all forty profiles faceless. It went unnoticed because the failure
   * looked identical to a cohort that had simply never been given photos.
   */
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

/**
 * Three photos for one profile, at the paths the funnel writes.
 *
 * Extracted because the drop is a photo-forward surface and a cohort with empty
 * `photos` arrays cannot exercise it — every card renders "no photos on this
 * profile", which is a real state but not the one worth testing. Applications
 * needed the same three uploads, so this is shared rather than duplicated.
 */
async function seedPhotos(profile: (typeof PROFILES)[number]): Promise<string[] | null> {
  const initial = profile.first_name.charAt(0).toUpperCase();
  const paths: string[] = [];

  for (let i = 0; i < 3; i += 1) {
    const path = `${profile.id}/seed-${i}.jpg`;
    const { error } = await db.storage
      .from("photos")
      .upload(path, await tile(profile.id, initial, i), {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (error) {
      console.error(`  ✗ photo ${path}: ${error.message}`);
      return null;
    }
    paths.push(path);
  }

  /*
   * Approved, unlike the funnel's uploads.
   *
   * 0020 makes `visible_profiles` filter unapproved photos, so a fixture full
   * of `approved: false` renders as forty people with no faces — which is
   * correct behaviour and a useless local environment. A seeded photo stands in
   * for one a reviewer already looked at, so it says so.
   */
  const { error } = await db
    .from("profiles")
    .update({ photos: paths.map((path, order) => ({ path, order, approved: true })) })
    .eq("id", profile.id);
  if (error) {
    console.error(`  ✗ photos on ${profile.first_name}: ${error.message}`);
    return null;
  }

  return paths;
}

/** Photos for the whole cohort, so drop cards have something to read. */
async function seedCohortPhotos() {
  console.log(`\n  Uploading photos for ${PROFILES.length} profiles…`);
  let done = 0;
  for (const profile of PROFILES) {
    if (await seedPhotos(profile)) done += 1;
  }
  // Named as a failure when it is one. The previous version printed
  // "✓ 0 profiles with 3 photos each", which reads like a tidy no-op.
  if (done === PROFILES.length) {
    console.log(`  ✓ ${done} profiles with 3 photos each`);
  } else {
    console.error(`  ✗ only ${done} of ${PROFILES.length} profiles got photos`);
  }
}

async function seedApplications() {
  console.log(`\n  Filing ${APPLICANT_COUNT} applications with media…`);

  const season = SEED_SEASON;
  let filed = 0;

  for (const profile of PROFILES.slice(0, APPLICANT_COUNT)) {
    const initial = profile.first_name.charAt(0).toUpperCase();

    const photoPaths = await seedPhotos(profile);
    if (!photoPaths) return;

    const selfiePath = `${profile.id}/seed-selfie.jpg`;
    // `upsert: true` works here only because this runs as the service role,
    // which bypasses the storage policies. A member cannot do this — the
    // verification-selfies bucket has no UPDATE policy at all, by design.
    const { error: selfieError } = await db.storage
      .from("verification-selfies")
      .upload(selfiePath, await tile(profile.id, initial, 9), {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (selfieError) {
      console.error(`  ✗ selfie: ${selfieError.message}`);
      return;
    }

    await db
      .from("verifications")
      .upsert(
        {
          user_id: profile.id,
          phone_verified_at: SEED_SEASON.created_at,
          selfie_path: selfiePath,
          // A plausible spread so the review screen shows a real number and
          // one applicant trips the low-score case.
          liveness_score: 0.72 + ((filed * 7) % 25) / 100,
        },
        { onConflict: "user_id", ignoreDuplicates: false },
      );

    await db
      .from("applications")
      .upsert(
        { user_id: profile.id, season_id: season.id, status: "applied" },
        { onConflict: "user_id,season_id", ignoreDuplicates: true },
      );

    const { data: application } = await db
      .from("applications")
      .select("id,status")
      .eq("user_id", profile.id)
      .eq("season_id", season.id)
      .maybeSingle();

    if (application) {
      const chain = ["phone_verified", "selfie_submitted", "under_review"] as const;
      const from = chain.indexOf(application.status as (typeof chain)[number]);
      for (const status of chain.slice(from + 1)) {
        const { error } = await db.rpc("advance_application", {
          p_application_id: application.id,
          p_new_status: status,
        });
        if (error) {
          console.error(`  ✗ advance ${profile.first_name} → ${status}: ${error.message}`);
          break;
        }
      }
    }

    filed += 1;
  }

  console.log(`  ✓ ${filed} applications sitting at under_review`);
}

/**
 * Give every seeded profile a membership in the seeded season.
 *
 * Priced from the season's own early-bird rule rather than a constant, so the
 * fixture stays honest if the price changes: the first `early_bird_cap` members
 * paid the early price, everyone after them the standard one.
 */
async function seedMembers() {
  const rows = PROFILES.map((profile, index) => ({
    user_id: profile.id,
    season_id: SEED_SEASON.id,
    stripe_payment_intent: `pi_deadbeef_${profile.id.slice(-12)}`,
    price_paid_cents:
      index < SEED_SEASON.early_bird_cap
        ? SEED_SEASON.price_early_cents
        : SEED_SEASON.price_standard_cents,
  }));

  const { error } = await db
    .from("season_members")
    .upsert(rows, { onConflict: "user_id,season_id", ignoreDuplicates: true });

  if (error) {
    console.error(`  ✗ season members: ${error.message}`);
    process.exit(1);
  }

  const { count } = await db
    .from("season_members")
    .select("id", { head: true, count: "exact" })
    .eq("season_id", SEED_SEASON.id);
  console.log(`  ✓ ${count} season members (fixture payment intents, prefixed pi_deadbeef_)`);
}

/**
 * Chats at every position on the fuse, so `fuse-sweep` has each branch to hit.
 *
 * `connects.drop_card_id` is `not null`, so each pair gets a real one-card drop
 * behind it — on day one's `drop_date`, which no live drop will ever use.
 */
async function seedChats() {
  console.log(`\n  Seeding chats across the fuse…`);

  const { data: season } = await db
    .from("seasons").select("id,starts_at,fuse_days").eq("id", SEED_SEASON.id).single();
  if (!season) {
    console.error("  ✗ no season");
    return;
  }
  const dropDate = season.starts_at.slice(0, 10);
  const h = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

  /**
   * One entry per branch of `tick`. `expect` is what the next sweep should do —
   * printed so the fixture states its own intent, and the verifier can assert
   * against it rather than against a number somebody typed twice.
   */
  const plan = [
    { label: "calm", fuse: h(120), state: "active", expect: "nothing" },
    { label: "48h window", fuse: h(40), state: "active", expect: "warn_48h" },
    { label: "24h window", fuse: h(20), state: "active", expect: "warn_24h" },
    { label: "already warned at 48h", fuse: h(40), state: "active", warned48: true, expect: "nothing" },
    { label: "expired", fuse: h(-2), state: "active", expect: "close_fuse" },
    { label: "date scheduled (paused)", fuse: h(30), state: "date_scheduled", paused: h(-6), dateIn: 48, expect: "nothing" },
    { label: "check-in, fresh", fuse: h(30), state: "post_date_checkin", dateIn: -30, expect: "nothing" },
    { label: "check-in, stale", fuse: h(30), state: "post_date_checkin", dateIn: -100, expect: "close_fuse" },
    // Two for checkin-sweep: a confirmed date more than 24h in the past, so the
    // check-in is overdue and the sweep has something to open. Two of them
    // because answering is one-way — the continue path and the close path each
    // need their own chat.
    { label: "date elapsed", fuse: h(30), state: "date_scheduled", paused: h(-40), dateIn: -30, expect: "open_checkin" },
    { label: "date elapsed, second", fuse: h(30), state: "date_scheduled", paused: h(-40), dateIn: -30, expect: "open_checkin" },
  ] as const;

  // Clear only what this flag owns, by its own drop_date.
  {
    const { data: old } = await db
      .from("drops").select("id").eq("season_id", season.id).eq("drop_date", dropDate);
    const ids = (old ?? []).map((d) => d.id);
    if (ids.length > 0) {
      const { data: cards } = await db.from("drop_cards").select("id").in("drop_id", ids);
      const cardIds = (cards ?? []).map((c) => c.id);
      if (cardIds.length > 0) {
        // chats → connects → drops: each references the next, none cascades.
        const { data: cons } = await db.from("connects").select("id").in("drop_card_id", cardIds);
        const conIds = (cons ?? []).map((c) => c.id);
        if (conIds.length > 0) {
          await db.from("chats").delete().in("connect_id", conIds);
          await db.from("connects").delete().in("id", conIds);
        }
      }
      await db.from("drops").delete().in("id", ids);
    }
  }

  let made = 0;
  for (const [i, item] of plan.entries()) {
    const sender = PROFILES[i * 2];
    const recipient = PROFILES[i * 2 + 1];
    if (!sender || !recipient) break;

    const { data: drop, error: dropError } = await db
      .from("drops")
      .insert({ season_id: season.id, user_id: sender.id, drop_date: dropDate, released_at: h(-24) })
      .select("id")
      .single();
    if (dropError) {
      console.error(`  ✗ drop for ${sender.first_name}: ${dropError.message}`);
      return;
    }

    const { data: card, error: cardError } = await db
      .from("drop_cards")
      .insert({ drop_id: drop.id, shown_profile_id: recipient.id, action: "connected", acted_at: h(-23) })
      .select("id")
      .single();
    if (cardError) {
      console.error(`  ✗ card: ${cardError.message}`);
      return;
    }

    const { data: connect, error: connectError } = await db
      .from("connects")
      .insert({
        season_id: season.id,
        from_user: sender.id,
        to_user: recipient.id,
        drop_card_id: card.id,
        prompt_ref: { type: "prompt", id: recipient.prompts?.[0]?.prompt_id ?? "prompt_01" },
        reply_text: `Fixture connect for the "${item.label}" case.`,
        status: "accepted",
        responded_at: h(-22),
      })
      .select("id")
      .single();
    if (connectError) {
      console.error(`  ✗ connect: ${connectError.message}`);
      return;
    }

    const { data: chat, error: chatError } = await db
      .from("chats")
      .insert({
        season_id: season.id,
        connect_id: connect.id,
        user_a: sender.id,
        user_b: recipient.id,
        state: item.state,
        fuse_expires_at: item.fuse,
        fuse_paused_at: "paused" in item ? item.paused : null,
        warned_48h: "warned48" in item ? item.warned48 : false,
        warned_24h: false,
      })
      .select("id")
      .single();
    if (chatError) {
      console.error(`  ✗ chat (${item.label}): ${chatError.message}`);
      return;
    }

    await db.from("messages").insert({
      chat_id: chat.id,
      sender_id: sender.id,
      kind: "text",
      body: `Fixture connect for the "${item.label}" case.`,
    });

    // A confirmed date is what pauses a fuse and what a check-in is measured
    // from, so the two states that depend on one get a real row.
    if ("dateIn" in item) {
      const { error } = await db.from("dates").insert({
        chat_id: chat.id,
        proposed_by: sender.id,
        status: "confirmed",
        scheduled_for: h(item.dateIn),
        place_name: "Fixture Coffee",
        confirmed_at: h(-20),
      });
      if (error) console.error(`  ✗ date (${item.label}): ${error.message}`);
    }

    console.log(
      `    ${item.label.padEnd(26)} ${sender.first_name} + ${recipient.first_name}` +
        `  → expect ${item.expect}`,
    );
    made += 1;
  }

  console.log(`  ✓ ${made} chats on drop_date ${dropDate}`);
}

/**
 * Resolve an email or a uuid to a member who can actually see any of this.
 *
 * Refuses rather than guesses. A fixture attached to somebody who is not a
 * season member is invisible — `memberGate` sends them to their application —
 * so seeding it would look like the script had failed.
 */
async function resolveMember(target: string) {
  const byId = /^[0-9a-f-]{36}$/i.test(target);
  let id = target;

  if (!byId) {
    const { data: page } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = (page?.users ?? []).find(
      (u) => u.email?.toLowerCase() === target.toLowerCase(),
    );
    if (!found) {
      console.error(`\n  ✗ no account with email ${target}\n`);
      process.exit(1);
    }
    id = found.id;
  }

  const { data: profile } = await db
    .from("profiles").select("id,first_name").eq("id", id).maybeSingle();
  if (!profile) {
    console.error(`\n  ✗ ${target} has no profile — they never finished applying\n`);
    process.exit(1);
  }

  const { data: membership } = await db
    .from("season_members").select("season_id").eq("user_id", id).maybeSingle();
  if (!membership) {
    console.error(
      `\n  ✗ ${profile.first_name} is not a member of any season, so none of this would be\n` +
        `    visible to them. Admit them and comp or buy a seat first.\n`,
    );
    process.exit(1);
  }

  /*
   * A seeded profile is a fine target, and refusing one was a rule worth
   * dropping.
   *
   * The first version rejected them, pointing at `--chats` instead — but
   * `--chats` seeds a cohort talking among itself, not one member with every
   * screen populated. And a member who came through the funnel has only a phone
   * number, so `preview:member` cannot mint them a link: pointing this at a
   * seeded member is the only way to *look* at what it produces before handing
   * it to somebody real.
   */

  return { id, firstName: profile.first_name, seasonId: membership.season_id };
}

/**
 * Everything the member app can show, pointed at one real account.
 *
 * Each fixture needs a chain — a drop, a card on it, a connect referencing the
 * card, and for the chats a chat referencing the connect — because
 * `connects.drop_card_id` is `not null`. That is the same chain a real
 * conversation is built from, so these rows behave like real ones everywhere
 * downstream rather than being a special case the app has to know about.
 *
 * `connects` is unique on `(from_user, to_user, season_id)`, so every fixture
 * takes its own partner.
 */
async function seedForMember(target: string) {
  const me = await resolveMember(target);
  console.log(`\n  Seeding the member app for ${me.firstName}…`);

  await purgeForMember(target, { quiet: true });

  const { data: season } = await db
    .from("seasons")
    .select("id,starts_at,ends_at,applications_open_at,phase,timezone")
    .eq("id", me.seasonId)
    .single();
  const seasonRow = season;
  if (!season || !seasonRow) {
    console.error("  ✗ their season vanished between two queries");
    return;
  }

  const h = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

  /*
   * Today in the season's own zone, via the same `dropDateFor` the crons use.
   *
   * The first attempt was `new Date(new Date().toLocaleString("en-CA", { timeZone }))`,
   * which throws `RangeError: Invalid time value` — `toLocaleString` returns
   * "2026-09-12, 11:20:00 a.m." and `Date` will not parse it back. Reaching for
   * the function that already answers this question is both correct and the
   * only way the fixture lands on the date the app will look for.
   */
  const today = dropDateFor(new Date().toISOString(), season.timezone);

  /*
   * The season has to actually be serving, or none of this is reachable.
   *
   * `seed()` upserts the season fixture on every run, which resets `phase` to
   * the shipped `applications_open` — so seeding the member app would leave the
   * member app switched off, showing "Not yet" over a drop that exists. This
   * does what `season-tick` would do at 6 AM, and only when the calendar agrees:
   * it never moves a season that has not started or one somebody closed.
   */
  {
    const calendar = phaseForDate(
      {
        phase: seasonRow.phase,
        applications_open_at: seasonRow.applications_open_at,
        starts_at: seasonRow.starts_at,
        ends_at: seasonRow.ends_at,
      },
      new Date().toISOString(),
    );
    if (calendar === "live" || calendar === "finale_week") {
      if (seasonRow.phase !== calendar) {
        await db.from("seasons").update({ phase: calendar }).eq("id", season.id);
        console.log(`  ✓ season moved to ${calendar} — the calendar already said so`);
      }
    } else {
      console.log(
        `  ! season is ${calendar} by the calendar, so Tonight will say "Not yet".\n` +
          `    The notes and chats below are still reachable.`,
      );
    }
  }

  /*
   * Partners, one per fixture, and photos for each.
   *
   * The seeded cohort ships without photos unless `--members` has run, and the
   * drop is a photo-forward surface: every card would read "no photos on this
   * profile", which is a real state and not the one worth looking at. Only the
   * profiles this actually uses get them, because uploading three tiles for
   * all forty takes a minute and this needs twelve.
   */
  /*
   * The target is filtered out, because `connects` has a `no_self_connect`
   * check and will say so.
   *
   * Only bites when the target is itself one of the seeded profiles, which is
   * exactly the case used to look at this before pointing it at somebody real.
   * The database caught it; the fixture had quietly tried to introduce Priya to
   * Priya.
   */
  const cast = PROFILES.filter((profile) => profile.id !== me.id).slice(0, 12);
  let withPhotos = 0;
  for (const profile of cast) if (await seedPhotos(profile)) withPhotos += 1;
  if (withPhotos === cast.length) {
    console.log(`  ✓ photos for the ${cast.length} profiles this uses`);
  } else {
    // Not fatal — the rest of the fixture is still worth having — but never
    // reported as a tick. The first run of this printed one over twelve
    // failed uploads.
    console.error(`  ✗ photos: only ${withPhotos} of ${cast.length} uploaded`);
  }

  /** A drop belonging to `owner` with one card showing `shown`. */
  const seasonId = season.id;

  async function chain(owner: string, shown: string, dropDate: string, actedAt: string | null) {
    const { data: drop, error: de } = await db
      .from("drops")
      .upsert(
        { season_id: seasonId, user_id: owner, drop_date: dropDate, released_at: h(-26) },
        { onConflict: "user_id,season_id,drop_date" },
      )
      .select("id")
      .single();
    if (de || !drop) throw new Error(`drop: ${de?.message}`);

    /*
     * Upserted, not inserted. `drop_cards` is unique on
     * `(drop_id, shown_profile_id)`, and a run that fails partway — the first
     * one did, on a self-connect — leaves cards behind that the next run then
     * collided with. A fixture you cannot re-run is a fixture you have to purge
     * by hand before every attempt.
     */
    const { data: card, error: ce } = await db
      .from("drop_cards")
      .upsert(
        {
          drop_id: drop.id,
          shown_profile_id: shown,
          // "pending" is the unanswered state, not null — the column is not
          // nullable, and a card nobody has acted on is exactly what `pending`
          // means.
          action: actedAt ? "connected" : "pending",
          acted_at: actedAt,
        },
        { onConflict: "drop_id,shown_profile_id" },
      )
      .select("id")
      .single();
    if (ce || !card) throw new Error(`card: ${ce?.message}`);
    return card.id;
  }

  let notes = 0;
  let chats = 0;

  // ---- notes waiting on them ---------------------------------------------
  // Their own drop_date is offset so these chains can never collide with the
  // real drop built below, which is keyed (user, season, date).
  for (const [i, partner] of cast.slice(0, 2).entries()) {
    const cardId = await chain(partner.id, me.id, `${season.starts_at.slice(0, 10)}`, h(-20 - i));
    const { error } = await db.from("connects").insert({
      season_id: season.id,
      from_user: partner.id,
      to_user: me.id,
      drop_card_id: cardId,
      prompt_ref: { type: "prompt", id: "prompt_01" },
      reply_text:
        i === 0
          ? "You said you know which Publix to avoid on a Sunday. I need the list."
          : "Grits without sugar is the correct answer and I will not be taking questions.",
    });
    if (error) console.error(`  ✗ note from ${partner.first_name}: ${error.message}`);
    else notes += 1;
  }

  // ---- conversations, one at each point on the fuse ------------------------
  const talking = [
    { label: "calm, five days left", fuse: h(120), state: "active" as const, dateIn: null },
    { label: "amber, 40 hours", fuse: h(40), state: "active" as const, dateIn: null },
    { label: "warm-red, 20 hours", fuse: h(20), state: "active" as const, dateIn: null },
    { label: "date booked, fuse paused", fuse: h(30), state: "date_scheduled" as const, dateIn: 48 },
  ];

  for (const [i, item] of talking.entries()) {
    const partner = cast[2 + i]!;
    const cardId = await chain(partner.id, me.id, season.starts_at.slice(0, 10), h(-30 - i));
    const { data: connect, error: ce } = await db
      .from("connects")
      .insert({
        season_id: season.id,
        from_user: partner.id,
        to_user: me.id,
        drop_card_id: cardId,
        prompt_ref: { type: "prompt", id: "prompt_01" },
        reply_text: "This one turned into a conversation.",
        status: "accepted",
        responded_at: h(-29 - i),
      })
      .select("id")
      .single();
    if (ce || !connect) {
      console.error(`  ✗ connect (${item.label}): ${ce?.message}`);
      continue;
    }

    const { data: chat, error: che } = await db
      .from("chats")
      .insert({
        season_id: season.id,
        connect_id: connect.id,
        user_a: partner.id,
        user_b: me.id,
        state: item.state,
        fuse_expires_at: item.fuse,
        fuse_paused_at: item.dateIn === null ? null : h(-6),
      })
      .select("id")
      .single();
    if (che || !chat) {
      console.error(`  ✗ chat (${item.label}): ${che?.message}`);
      continue;
    }

    // Two messages, one each way, so the thread reads like a conversation and
    // the list preview has something other than "No messages yet".
    await db.from("messages").insert([
      {
        chat_id: chat.id,
        sender_id: partner.id,
        kind: "text",
        body: `Hi — this is the "${item.label}" fixture.`,
      },
      {
        chat_id: chat.id,
        sender_id: me.id,
        kind: "text",
        body: "And this is you answering, so the preview shows both sides.",
      },
    ]);

    if (item.dateIn !== null) {
      await db.from("dates").insert({
        chat_id: chat.id,
        proposed_by: partner.id,
        status: "confirmed",
        scheduled_for: h(item.dateIn),
        place_name: "Fixture Coffee, Grayson",
        confirmed_at: h(-5),
      });
    }
    console.log(`    ${item.label.padEnd(28)} with ${partner.first_name}`);
    chats += 1;
  }

  // ---- a note they sent, still unanswered ---------------------------------
  {
    const partner = cast[6]!;
    const cardId = await chain(me.id, partner.id, season.starts_at.slice(0, 10), h(-12));
    const { error } = await db.from("connects").insert({
      season_id: season.id,
      from_user: me.id,
      to_user: partner.id,
      drop_card_id: cardId,
      prompt_ref: { type: "prompt", id: "prompt_01" },
      reply_text: "This is a note you sent that nobody has answered yet.",
    });
    if (error) console.error(`  ✗ outgoing note: ${error.message}`);
  }

  // ---- an ending, which is the whole product ------------------------------
  {
    const partner = cast[7]!;
    const cardId = await chain(partner.id, me.id, season.starts_at.slice(0, 10), h(-60));
    const { error } = await db.from("connects").insert({
      season_id: season.id,
      from_user: partner.id,
      to_user: me.id,
      drop_card_id: cardId,
      prompt_ref: { type: "prompt", id: "prompt_01" },
      reply_text: "A note you answered with a no.",
      status: "declined",
      responded_at: h(-58),
    });
    if (error) console.error(`  ✗ declined note: ${error.message}`);
  }
  {
    // A chat whose fuse ran out. §5: every ending carries an answer, so this
    // one keeps its closing note and stays readable under "Ended".
    const partner = cast[8]!;
    const cardId = await chain(partner.id, me.id, season.starts_at.slice(0, 10), h(-200));
    const { data: connect } = await db
      .from("connects")
      .insert({
        season_id: season.id,
        from_user: partner.id,
        to_user: me.id,
        drop_card_id: cardId,
        prompt_ref: { type: "prompt", id: "prompt_01" },
        reply_text: "This became a chat and then ran out of time.",
        status: "accepted",
        responded_at: h(-199),
      })
      .select("id")
      .single();
    if (connect) {
      const { data: chat } = await db
        .from("chats")
        .insert({
          season_id: season.id,
          connect_id: connect.id,
          user_a: partner.id,
          user_b: me.id,
          state: "closed_fuse",
          fuse_expires_at: h(-24),
          closed_at: h(-24),
        })
        .select("id")
        .single();
      if (chat) {
        await db.from("messages").insert({
          chat_id: chat.id,
          sender_id: partner.id,
          kind: "text",
          body: "This conversation ran out of time.",
        });
        chats += 1;
      }
    }
  }

  // ---- tonight's drop, already released -----------------------------------
  {
    const shown = cast.slice(9, 12);
    const { data: drop, error: de } = await db
      .from("drops")
      .upsert(
        { season_id: season.id, user_id: me.id, drop_date: today, released_at: h(-1) },
        { onConflict: "user_id,season_id,drop_date" },
      )
      .select("id")
      .single();
    if (de || !drop) {
      console.error(`  ✗ tonight's drop: ${de?.message}`);
    } else {
      // Cleared first: re-running must not stack six cards on one drop.
      await db.from("drop_cards").delete().eq("drop_id", drop.id);
      const { error } = await db.from("drop_cards").insert(
        shown.map((profile) => ({
          drop_id: drop.id,
          shown_profile_id: profile.id,
          // Unanswered, which is the only state the drop screen can be used
          // on — a card already connected or passed is read-only.
          action: "pending" as const,
        })),
      );
      if (error) console.error(`  ✗ tonight's cards: ${error.message}`);
      else console.log(`  ✓ tonight's drop released with ${shown.length} cards`);
    }
  }

  console.log(
    `\n  ${me.firstName} now has ${notes} note(s) to answer, ${chats} conversation(s) ` +
      `including one closed, a note they sent, a declined one, and a drop waiting.`,
  );
  console.log(`  Undo with: pnpm db:seed:remote --for ${target} --purge-for`);
}

/**
 * Remove only the pairings this script created.
 *
 * Scoped by "the other side is a seed profile", which is what makes it safe to
 * run against a live account: a real conversation has a real person on the
 * other end, and no real person has a `deadbeef-` id.
 */
async function purgeForMember(target: string | null, opts: { quiet?: boolean } = {}) {
  if (!target) {
    console.error(`\n  ✗ --purge-for needs --for <email-or-uuid>\n`);
    process.exit(1);
  }
  const me = await resolveMember(target);
  if (!opts.quiet) console.log(`\n  Removing seed fixtures from ${me.firstName}…`);

  const { data: connects } = await db
    .from("connects")
    .select("id,from_user,to_user,drop_card_id")
    .or(`from_user.eq.${me.id},to_user.eq.${me.id}`);

  const mine = (connects ?? []).filter((c) => {
    const other = c.from_user === me.id ? c.to_user : c.from_user;
    return isSeedId(other);
  });

  const connectIds = mine.map((c) => c.id);
  const cardIds = mine.map((c) => c.drop_card_id).filter((x): x is string => Boolean(x));

  if (connectIds.length > 0) {
    const { data: chats } = await db.from("chats").select("id").in("connect_id", connectIds);
    const chatIds = (chats ?? []).map((c) => c.id);
    if (chatIds.length > 0) {
      await db.from("messages").delete().in("chat_id", chatIds);
      await db.from("dates").delete().in("chat_id", chatIds);
      await db.from("chats").delete().in("id", chatIds);
    }
    await db.from("connects").delete().in("id", connectIds);
  }

  /*
   * The drops behind them, but only ones whose every card shows a seed profile
   * — a real drop built by the cron for this member must survive, and after
   * `generate-drops` has run their real drop and a fixture drop can share a
   * date.
   */
  const { data: drops } = await db
    .from("drops").select("id,user_id").eq("season_id", me.seasonId);
  const candidates = (drops ?? []).filter((d) => d.user_id === me.id || isSeedId(d.user_id));
  let removedDrops = 0;
  for (const drop of candidates) {
    const { data: cards } = await db
      .from("drop_cards").select("id,shown_profile_id").eq("drop_id", drop.id);
    const rows = cards ?? [];
    if (rows.length === 0) continue;
    const allSeedFacing = rows.every(
      (c) => isSeedId(c.shown_profile_id) || c.shown_profile_id === me.id,
    );
    if (!allSeedFacing) continue;
    // A card still referenced by a connect we did not delete is not ours.
    const { count } = await db
      .from("connects")
      .select("id", { head: true, count: "exact" })
      .in("drop_card_id", rows.map((c) => c.id));
    if ((count ?? 0) > 0) continue;
    await db.from("drop_cards").delete().eq("drop_id", drop.id);
    await db.from("drops").delete().eq("id", drop.id);
    removedDrops += 1;
  }

  if (!opts.quiet) {
    console.log(
      `  ✓ removed ${connectIds.length} connect(s) with their chats, and ${removedDrops} drop(s)\n`,
    );
  }
  void cardIds;
}

async function purge() {
  console.log(`\nPurging seed data from ${URL}\n`);

  // Storage objects are not covered by any cascade — deleting the auth user
  // removes the profile row that references them and orphans the files.
  let files = 0;
  for (const profile of PROFILES) {
    for (const [bucket, paths] of [
      /* Both extensions: .webp is what runs before 0035 wrote, .jpg is what
         runs after it write, and a purge has to clear either. */
      ["photos", ["seed-0.jpg", "seed-1.jpg", "seed-2.jpg",
                  "seed-0.webp", "seed-1.webp", "seed-2.webp"]],
      ["verification-selfies", ["seed-selfie.jpg", "seed-selfie.webp"]],
    ] as const) {
      const { data } = await db.storage
        .from(bucket)
        .remove(paths.map((name) => `${profile.id}/${name}`));
      files += data?.length ?? 0;
    }
  }
  console.log(`  removed ${files} seeded storage object(s)`);

  /*
   * Chat-side rows go first, in dependency order.
   *
   * `chats.connect_id` → `connects.id` → `drop_cards.id` are all plain
   * references with no cascade, so leaving them to the `on delete cascade` from
   * `profiles` means Postgres has to unpick three non-cascading foreign keys in
   * one statement. Deleting them deliberately, innermost last, is the difference
   * between a clean purge and an opaque constraint error.
   */
  {
    const { data: drops } = await db
      .from("drops").select("id").eq("season_id", SEED_SEASON.id);
    const dropIds = (drops ?? []).map((d) => d.id);
    const { data: cards } = dropIds.length
      ? await db.from("drop_cards").select("id").in("drop_id", dropIds)
      : { data: [] as { id: string }[] };
    const cardIds = (cards ?? []).map((c) => c.id);
    const { data: connects } = cardIds.length
      ? await db.from("connects").select("id").in("drop_card_id", cardIds)
      : { data: [] as { id: string }[] };
    const connectIds = (connects ?? []).map((c) => c.id);

    if (connectIds.length) {
      await db.from("chats").delete().in("connect_id", connectIds);
      await db.from("connects").delete().in("id", connectIds);
    }
    await db.from("chats").delete().eq("season_id", SEED_SEASON.id);
    await db.from("connects").delete().eq("season_id", SEED_SEASON.id);
    if (dropIds.length) await db.from("drops").delete().in("id", dropIds);
    console.log(
      `  removed ${dropIds.length} drop(s), ${connectIds.length} connect(s) and their chats`,
    );
  }

  /*
   * `season_members.user_id` and `.season_id` are plain references with no
   * `on delete cascade` — deliberately, since a membership is a payment record
   * and should not evaporate. That makes it the one table that blocks both
   * halves of this purge, so it goes first.
   */
  {
    const { count } = await db
      .from("season_members")
      .select("id", { head: true, count: "exact" })
      .eq("season_id", SEED_SEASON.id);
    const { error } = await db.from("season_members").delete().eq("season_id", SEED_SEASON.id);
    if (error) console.error(`  ✗ season members: ${error.message}`);
    else console.log(`  removed ${count ?? 0} season member row(s)`);
  }

  // Profiles cascade from auth.users, so deleting the user removes both.
  let removed = 0;
  for (const profile of PROFILES) {
    const { error } = await db.auth.admin.deleteUser(profile.id);
    if (!error) removed += 1;
    else if (!/not found/i.test(error.message)) {
      console.error(`  ✗ ${profile.id}: ${error.message}`);
    }
  }
  console.log(`  removed ${removed} seeded auth user(s)`);

  const { error } = await db.from("seasons").delete().eq("id", SEED_SEASON.id);
  if (error) console.error(`  ✗ season: ${error.message}`);
  else console.log(`  removed the seeded season`);

  console.log();
}

async function seed() {
  console.log(`\nSeeding ${URL}\n`);

  // ---- season -------------------------------------------------------------
  {
    const season = { ...SEED_SEASON };

    if (goLive) {
      const startsAt = new Date(Date.now() - LIVE_STARTED_DAYS_AGO * 86_400_000);
      const endsAt = new Date(startsAt.getTime() + 56 * 86_400_000);
      season.phase = "live";
      season.starts_at = startsAt.toISOString();
      season.ends_at = endsAt.toISOString();
      // Applications must have opened before day one or the fixture is
      // internally inconsistent, and `public_season_stats` reads this.
      season.applications_open_at = new Date(
        startsAt.getTime() - 60 * 86_400_000,
      ).toISOString();
    }

    const { error } = await db.from("seasons").upsert(season, { onConflict: "id" });
    if (error) {
      console.error(`  ✗ season: ${error.message}`);
      process.exit(1);
    }
    console.log(`  ✓ season "${season.name}" (${season.phase})`);
    if (goLive) {
      console.log(
        `    ! --live backdated day one to ${season.starts_at.slice(0, 10)} — ` +
          `the marketing hero now reads as a season in progress`,
      );
    }
  }

  // ---- auth users ---------------------------------------------------------
  // profiles.id references auth.users(id), so the auth row has to exist first.
  // The admin API accepts a pinned id, which is what keeps the seed
  // deterministic across runs and machines.
  let created = 0;
  let existing = 0;
  for (const profile of PROFILES) {
    const { error } = await db.auth.admin.createUser({
      id: profile.id,
      email: emailFor(profile.id),
      email_confirm: true,
      app_metadata: { provider: "phone", providers: ["phone"], seed: true },
    });

    if (!error) {
      created += 1;
    } else if (/already|registered|exists|duplicate/i.test(error.message)) {
      existing += 1;
    } else {
      console.error(`  ✗ auth user ${profile.id}: ${error.message}`);
      process.exit(1);
    }
  }
  console.log(`  ✓ auth users — ${created} created, ${existing} already present`);

  // ---- profiles -----------------------------------------------------------
  {
    const { error } = await db.from("profiles").upsert(PROFILES, { onConflict: "id" });
    if (error) {
      console.error(`  ✗ profiles: ${error.message}`);
      process.exit(1);
    }
    console.log(`  ✓ ${PROFILES.length} profiles`);
  }

  // A guard against the generator ever losing the prefix that makes the seed
  // recognisable and purgeable.
  const stray = PROFILES.filter((p) => !isSeedId(p.id));
  if (stray.length > 0) {
    console.error(`\n  ! ${stray.length} generated id(s) are missing the seed prefix\n`);
    process.exit(1);
  }

  if (withMembers || goLive || withChats) {
    await seedMembers();
    await seedCohortPhotos();
  }
  if (withApplications) await seedApplications();
  if (withChats) await seedChats();
  if (forTarget) await seedForMember(forTarget);

  console.log(`\nDone. Every seeded id begins "${seedId(0).slice(0, 8)}-".\n`);
}

void (purging ? purge() : purgingFor ? purgeForMember(forTarget) : seed());
