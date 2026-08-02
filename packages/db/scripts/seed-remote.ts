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

async function seedApplications() {
  console.log(`\n  Filing ${APPLICANT_COUNT} applications with media…`);

  const season = SEED_SEASON;
  let filed = 0;

  for (const profile of PROFILES.slice(0, APPLICANT_COUNT)) {
    const initial = profile.first_name.charAt(0).toUpperCase();

    // Three photos and a selfie, uploaded to the same paths the funnel writes.
    const photoPaths: string[] = [];
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
        return;
      }
      photoPaths.push(path);
    }

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
      .from("profiles")
      .update({
        photos: photoPaths.map((path, order) => ({ path, order, approved: false })),
      })
      .eq("id", profile.id);

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
    const { error } = await db.from("seasons").upsert(SEED_SEASON, { onConflict: "id" });
    if (error) {
      console.error(`  ✗ season: ${error.message}`);
      process.exit(1);
    }
    console.log(`  ✓ season "${SEED_SEASON.name}" (${SEED_SEASON.phase})`);
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

  if (withApplications) await seedApplications();

  console.log(`\nDone. Every seeded id begins "${seedId(0).slice(0, 8)}-".\n`);
}

void (purging ? purge() : seed());
