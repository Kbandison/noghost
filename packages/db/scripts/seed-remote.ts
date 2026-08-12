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
const goLive = process.argv.includes("--live");

/** Day one, relative to the run, when `--live` is used. Mid-week-two. */
const LIVE_STARTED_DAYS_AGO = 9;

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

  if (withMembers || goLive) {
    await seedMembers();
    await seedCohortPhotos();
  }
  if (withApplications) await seedApplications();

  console.log(`\nDone. Every seeded id begins "${seedId(0).slice(0, 8)}-".\n`);
}

void (purging ? purge() : seed());
