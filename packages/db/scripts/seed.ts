/**
 * Generates `supabase/seed.sql` from the same generator the in-app seed layer
 * uses, so local Postgres and the no-backend UI agree on every row.
 *
 * Run: pnpm db:seed     (then `supabase db reset` to apply)
 *
 * Every row is prefixed `deadbeef-`, so `purge_seed_data()` at the bottom of the
 * emitted file removes the whole cohort in one statement. Never run against
 * production.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SEED_PROFILES,
  SEED_SEASON,
  SEED_SEATS_CLAIMED,
  SEED_ID_PREFIX,
  seedId,
} from "../src/seed/data";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../../../supabase/seed.sql");

/** Single-quote escaping for literals. */
const q = (v: string | null | undefined) =>
  v === null || v === undefined ? "NULL" : `'${v.replace(/'/g, "''")}'`;

const arr = (values: readonly string[]) =>
  `ARRAY[${values.map((v) => q(v)).join(",")}]::text[]`;

const json = (value: unknown) => `${q(JSON.stringify(value))}::jsonb`;

const lines: string[] = [
  "-- GENERATED FILE — do not edit by hand.",
  "-- Source: packages/db/scripts/seed.ts  ·  regenerate with `pnpm db:seed`",
  "--",
  "-- Spec §10 Phase 0: one season plus 40 fake profiles, clearly marked and",
  `-- admin-purgeable. Every seeded id begins '${SEED_ID_PREFIX}-'.`,
  "",
  "begin;",
  "",
  "-- ============ SEASON ============",
  `insert into seasons (
  id, name, city, phase, applications_open_at, starts_at, ends_at, member_cap,
  drop_time, drop_max, fuse_days, claim_hours, price_early_cents,
  price_standard_cents, early_bird_cap, encore_start_week, timezone, created_at
) values (
  ${q(SEED_SEASON.id)}, ${q(SEED_SEASON.name)}, ${q(SEED_SEASON.city)},
  ${q(SEED_SEASON.phase)}::season_phase, ${q(SEED_SEASON.applications_open_at)},
  ${q(SEED_SEASON.starts_at)}, ${q(SEED_SEASON.ends_at)}, ${SEED_SEASON.member_cap},
  ${q(SEED_SEASON.drop_time)}, ${SEED_SEASON.drop_max}, ${SEED_SEASON.fuse_days},
  ${SEED_SEASON.claim_hours}, ${SEED_SEASON.price_early_cents},
  ${SEED_SEASON.price_standard_cents}, ${SEED_SEASON.early_bird_cap},
  ${SEED_SEASON.encore_start_week}, ${q(SEED_SEASON.timezone)}, ${q(SEED_SEASON.created_at)}
) on conflict (id) do nothing;`,
  "",
  "-- ============ AUTH USERS ============",
  "-- profiles.id references auth.users, so the seeded members need auth rows.",
  "-- Inserted directly because the admin API cannot pin a specific uuid, and",
  "-- deterministic ids are what make this file reproducible.",
];

for (const p of SEED_PROFILES) {
  const email = `seed-${p.id.slice(-4)}@noghost.test`;
  lines.push(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values (${q(p.id)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  ${q(email)}, '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;`,
  );
}

lines.push("", "-- ============ PROFILES ============");

for (const p of SEED_PROFILES) {
  lines.push(
    `insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  ${q(p.id)}, ${q(p.first_name)}, ${q(p.birthdate)}, ${q(p.gender)},
  ${arr(p.seeking)}, ${p.age_min}, ${p.age_max}, ${arr(p.interests)},
  ${q(p.neighborhood)}, ${p.height_cm ?? "NULL"}, ${q(p.occupation)},
  ${json(p.photos)}, ${json(p.prompts)}, ${q(p.status)}::member_status,
  ${q(p.created_at)}, ${q(p.updated_at)}
) on conflict (id) do nothing;`,
  );
}

lines.push(
  "",
  "-- ============ MEMBERSHIPS ============",
  `-- ${SEED_SEATS_CLAIMED} claimed seats drive the marketing counter; the first`,
  "-- 40 are these profiles, and the rest are recorded as paid seats without a",
  "-- profile so the number on the hero is real without inventing more people.",
);

SEED_PROFILES.forEach((p, i) => {
  lines.push(
    `insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values (${q(seedId(200 + i))}, ${q(p.id)}, ${q(SEED_SEASON.id)}, ${q(`pi_seed_${i}`)},
  ${i < SEED_SEASON.early_bird_cap ? SEED_SEASON.price_early_cents : SEED_SEASON.price_standard_cents})
on conflict (user_id, season_id) do nothing;`,
  );
});

lines.push(
  "",
  "-- ============ APPLICATIONS ============",
  ...SEED_PROFILES.map(
    (p, i) =>
      `insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values (${q(seedId(300 + i))}, ${q(p.id)}, ${q(SEED_SEASON.id)}, 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;`,
  ),
  "",
  "-- ============ NOTIFICATION PREFS ============",
  ...SEED_PROFILES.map(
    (p) =>
      `insert into notification_prefs (user_id) values (${q(p.id)}) on conflict (user_id) do nothing;`,
  ),
  "",
  "commit;",
  "",
  "-- ============ PURGE ============",
  "-- Admin-purgeable in one call (spec §10 Phase 0).",
  `create or replace function purge_seed_data()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from auth.users where id::text like '${SEED_ID_PREFIX}-%';
  delete from seasons  where id::text like '${SEED_ID_PREFIX}-%';
end;
$$;

comment on function purge_seed_data is
  'Removes every seeded row. Profiles, memberships and applications cascade from auth.users.';

revoke execute on function purge_seed_data() from public, anon, authenticated;`,
  "",
);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, lines.join("\n"), "utf8");

console.log(
  `Wrote ${OUT}\n  1 season · ${SEED_PROFILES.length} profiles · ${SEED_PROFILES.length} memberships`,
);
