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
 *   pnpm db:seed:remote --purge
 */

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Database } from "@noghost/types";
import { SEED_SEASON, generateSeedProfiles, isSeedId, seedId } from "../src/seed/data";

const ENV_PATH = resolve(process.cwd(), "apps/web/.env.local");
if (existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);

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
const goLive = process.argv.includes("--live") || process.argv.includes("--chats");

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

  return sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
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
    const path = `${profile.id}/seed-${i}.webp`;
    const { error } = await db.storage
      .from("photos")
      .upload(path, await tile(profile.id, initial, i), {
        contentType: "image/webp",
        upsert: true,
      });
    if (error) {
      console.error(`  ✗ photo ${path}: ${error.message}`);
      return null;
    }
    paths.push(path);
  }

  const { error } = await db
    .from("profiles")
    .update({ photos: paths.map((path, order) => ({ path, order, approved: false })) })
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
  console.log(`  ✓ ${done} profiles with 3 photos each`);
}

async function seedApplications() {
  console.log(`\n  Filing ${APPLICANT_COUNT} applications with media…`);

  const season = SEED_SEASON;
  let filed = 0;

  for (const profile of PROFILES.slice(0, APPLICANT_COUNT)) {
    const initial = profile.first_name.charAt(0).toUpperCase();

    const photoPaths = await seedPhotos(profile);
    if (!photoPaths) return;

    const selfiePath = `${profile.id}/seed-selfie.webp`;
    // `upsert: true` works here only because this runs as the service role,
    // which bypasses the storage policies. A member cannot do this — the
    // verification-selfies bucket has no UPDATE policy at all, by design.
    const { error: selfieError } = await db.storage
      .from("verification-selfies")
      .upload(selfiePath, await tile(profile.id, initial, 9), {
        contentType: "image/webp",
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

async function purge() {
  console.log(`\nPurging seed data from ${URL}\n`);

  // Storage objects are not covered by any cascade — deleting the auth user
  // removes the profile row that references them and orphans the files.
  let files = 0;
  for (const profile of PROFILES) {
    for (const [bucket, paths] of [
      ["photos", ["seed-0.webp", "seed-1.webp", "seed-2.webp"]],
      ["verification-selfies", ["seed-selfie.webp"]],
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

  console.log(`\nDone. Every seeded id begins "${seedId(0).slice(0, 8)}-".\n`);
}

void (purging ? purge() : seed());
