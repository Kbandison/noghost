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

/** The seeded members' throwaway logins. Never used to sign in. */
const emailFor = (id: string) => `seed-${id.slice(-4)}@noghost.test`;

async function purge() {
  console.log(`\nPurging seed data from ${URL}\n`);

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

  console.log(`\nDone. Every seeded id begins "${seedId(0).slice(0, 8)}-".\n`);
}

void (purging ? purge() : seed());
