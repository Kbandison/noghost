-- GENERATED FILE — do not edit by hand.
-- Source: packages/db/scripts/seed.ts  ·  regenerate with `pnpm db:seed`
--
-- Spec §10 Phase 0: one season plus 40 fake profiles, clearly marked and
-- admin-purgeable. Every seeded id begins 'deadbeef-'.

begin;

-- ============ SEASON ============
insert into seasons (
  id, name, city, phase, applications_open_at, starts_at, ends_at, member_cap,
  drop_time, drop_max, fuse_days, claim_hours, price_early_cents,
  price_standard_cents, early_bird_cap, encore_start_week, timezone, created_at
) values (
  'deadbeef-0000-4000-8000-000000000001', 'Atlanta Season One', 'Atlanta',
  'applications_open'::season_phase, '2026-07-27T04:00:00.000Z',
  '2026-10-05T04:00:00.000Z', '2026-11-30T05:00:00.000Z', 300,
  '20:00', 3, 7,
  72, 4000,
  5000, 100,
  5, 'America/New_York', '2026-07-20T00:00:00.000Z'
) on conflict (id) do nothing;

-- ============ AUTH USERS ============
-- profiles.id references auth.users, so the seeded members need auth rows.
-- Inserted directly because the admin API cannot pin a specific uuid, and
-- deterministic ids are what make this file reproducible.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000100', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0100@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0101@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0102@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0103@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0104@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000105', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0105@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000106', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0106@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000107', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0107@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000108', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0108@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000109', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0109@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000110', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0110@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0111@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000112', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0112@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000113', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0113@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000114', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0114@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000115', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0115@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000116', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0116@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000117', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0117@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000118', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0118@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000119', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0119@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000120', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0120@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000121', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0121@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000122', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0122@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000123', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0123@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000124', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0124@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000125', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0125@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000126', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0126@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000127', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0127@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000128', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0128@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000129', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0129@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000130', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0130@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000131', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0131@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000132', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0132@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000133', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0133@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000134', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0134@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000135', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0135@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000136', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0136@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000137', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0137@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000138', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0138@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('deadbeef-0000-4000-8000-000000000139', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed-0139@noghost.test', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

-- ============ PROFILES ============
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000100', 'Maya', '1987-03-06', 'man',
  ARRAY['man','woman','nonbinary']::text[], 35, 44, ARRAY['stand-up','reading','motorcycles','thrifting','pottery','hiking','video games']::text[],
  'College Park', 182, 'public defender',
  '[]'::jsonb, '[{"prompt_id":"prompt_03","answer":"Why every good bakery smells slightly different."},{"prompt_id":"prompt_08","answer":"My own attempt at a sourdough starter. It''s named and it''s failing."},{"prompt_id":"prompt_11","answer":"A hot dog is a sandwich and the debate is beneath us."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000101', 'Devon', '1989-05-18', 'woman',
  ARRAY['man']::text[], 30, 42, ARRAY['volunteering','coffee','church','yoga','baking']::text[],
  'Riverdale', 173, 'structural engineer',
  '[]'::jsonb, '[{"prompt_id":"prompt_10","answer":"…drove to Savannah for a sandwich. It was worth it. I''d do it again."},{"prompt_id":"prompt_03","answer":"The Braves'' bullpen management. Bring a chair."},{"prompt_id":"prompt_08","answer":"My neighbour''s dog has learned to open the screen door and act innocent."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000102', 'Priya', '1996-03-11', 'nonbinary',
  ARRAY['nonbinary']::text[], 22, 34, ARRAY['sewing','running','cycling','painting','cats','politics','dive bars']::text[],
  'Fayetteville', 188, 'urban planner',
  '[]'::jsonb, '[{"prompt_id":"prompt_11","answer":"Restaurant butter should be room temperature or it''s a hostility."},{"prompt_id":"prompt_08","answer":"My neighbour''s dog has learned to open the screen door and act innocent."},{"prompt_id":"prompt_09","answer":"…in the third hour of a project I said would take one."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000103', 'Marcus', '2001-06-27', 'man',
  ARRAY['woman']::text[], 21, 34, ARRAY['theatre','writing','politics','startups','gardening','cooking','sewing','trivia']::text[],
  'Sandy Springs', 170, 'line cook',
  '[]'::jsonb, '[{"prompt_id":"prompt_02","answer":"…with both of us already arguing about where to go next time."},{"prompt_id":"prompt_01","answer":"I still call it the Sears building and I will not be taking questions."},{"prompt_id":"prompt_06","answer":"Cilantro. Fourteen years of being wrong, corrected in one meal."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000104', 'Nia', '2003-07-04', 'woman',
  ARRAY['nonbinary']::text[], 21, 30, ARRAY['travel','dancing','church','cats','investing','film','farmers markets','vegetarian cooking']::text[],
  'Avondale Estates', 170, 'physical therapist',
  '[]'::jsonb, '[{"prompt_id":"prompt_11","answer":"Restaurant butter should be room temperature or it''s a hostility."},{"prompt_id":"prompt_08","answer":"My own attempt at a sourdough starter. It''s named and it''s failing."},{"prompt_id":"prompt_02","answer":"…on a walk neither of us suggested out loud."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000105', 'Theo', '1991-06-15', 'nonbinary',
  ARRAY['nonbinary']::text[], 31, 42, ARRAY['hiking','soccer','politics','dive bars','fishing','cars','trivia','cooking','writing']::text[],
  'Summerhill', 158, 'pastry chef',
  '[]'::jsonb, '[{"prompt_id":"prompt_02","answer":"…on a walk neither of us suggested out loud."},{"prompt_id":"prompt_07","answer":"…you''re looking for something casual. I''m not, and I''d rather say so."},{"prompt_id":"prompt_12","answer":"…to have been genuinely surprised at least once."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000106', 'Camille', '1995-02-08', 'man',
  ARRAY['woman']::text[], 23, 38, ARRAY['woodworking','cooking','investing','reading','sewing','baking','theatre','cycling','pickup basketball','history']::text[],
  'Old Fourth Ward', 187, 'data analyst',
  '[]'::jsonb, '[{"prompt_id":"prompt_06","answer":"That being busy meant anything at all."},{"prompt_id":"prompt_05","answer":"…I''m early to everything and slightly smug about it."},{"prompt_id":"prompt_04","answer":"I say the awkward thing early instead of letting it sit."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000107', 'Andre', '1991-05-21', 'woman',
  ARRAY['man']::text[], 27, 44, ARRAY['vegetarian cooking','dive bars','theatre','woodworking','stand-up','baking','astronomy']::text[],
  'Alpharetta', 155, 'brewer',
  '[]'::jsonb, '[{"prompt_id":"prompt_03","answer":"The specific genius of a well-made public bus route."},{"prompt_id":"prompt_07","answer":"…you''re looking for something casual. I''m not, and I''d rather say so."},{"prompt_id":"prompt_11","answer":"Restaurant butter should be room temperature or it''s a hostility."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000108', 'Simone', '1987-03-02', 'nonbinary',
  ARRAY['man','woman']::text[], 31, 44, ARRAY['photography','writing','cycling','live music','vegetarian cooking','karaoke','cars','hiking']::text[],
  'Stone Mountain', 166, 'ER nurse',
  '[]'::jsonb, '[{"prompt_id":"prompt_01","answer":"I have opinions about which stretch of the Beltline is best at 7am."},{"prompt_id":"prompt_02","answer":"…on a walk neither of us suggested out loud."},{"prompt_id":"prompt_08","answer":"My own attempt at a sourdough starter. It''s named and it''s failing."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000109', 'Wes', '2001-06-18', 'man',
  ARRAY['woman','nonbinary']::text[], 21, 31, ARRAY['painting','cars','camping','farmers markets','climbing','karaoke','motorcycles','running']::text[],
  'Alpharetta', 180, 'brewer',
  '[]'::jsonb, '[{"prompt_id":"prompt_02","answer":"…us realising we''ve been at the table two hours past closing."},{"prompt_id":"prompt_04","answer":"I remember what you told me last time and I ask about it."},{"prompt_id":"prompt_03","answer":"Why every good bakery smells slightly different."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000110', 'Imani', '1990-03-04', 'woman',
  ARRAY['man']::text[], 29, 46, ARRAY['baking','board games','film','astronomy','brunch','natural wine','podcasts','travel','volunteering']::text[],
  'Summerhill', 188, 'urban planner',
  '[]'::jsonb, '[{"prompt_id":"prompt_11","answer":"Grits do not need sugar and I''ll die on this."},{"prompt_id":"prompt_07","answer":"…you''re looking for something casual. I''m not, and I''d rather say so."},{"prompt_id":"prompt_12","answer":"…someone I''d want to introduce to my sister."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000111', 'Jonah', '2002-11-26', 'nonbinary',
  ARRAY['nonbinary']::text[], 21, 28, ARRAY['film','climbing','sewing','pottery','gardening','cooking','cycling','podcasts']::text[],
  'Riverdale', 168, 'urban planner',
  '[]'::jsonb, '[{"prompt_id":"prompt_04","answer":"I''m genuinely happy for people, including strangers."},{"prompt_id":"prompt_03","answer":"Why every good bakery smells slightly different."},{"prompt_id":"prompt_12","answer":"…to have been genuinely surprised at least once."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000112', 'Rosa', '1987-02-04', 'man',
  ARRAY['woman']::text[], 33, 46, ARRAY['theatre','cooking','video games','motorcycles','woodworking']::text[],
  'Riverdale', 173, 'physical therapist',
  '[]'::jsonb, '[{"prompt_id":"prompt_10","answer":"…drove to Savannah for a sandwich. It was worth it. I''d do it again."},{"prompt_id":"prompt_02","answer":"…on a walk neither of us suggested out loud."},{"prompt_id":"prompt_11","answer":"Restaurant butter should be room temperature or it''s a hostility."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000113', 'Kwame', '2000-04-05', 'woman',
  ARRAY['man']::text[], 21, 36, ARRAY['cats','painting','motorcycles','pickup basketball','astronomy','video games','climbing','karaoke']::text[],
  'Cabbagetown', 187, 'brewer',
  '[]'::jsonb, '[{"prompt_id":"prompt_04","answer":"I remember what you told me last time and I ask about it."},{"prompt_id":"prompt_11","answer":"A hot dog is a sandwich and the debate is beneath us."},{"prompt_id":"prompt_02","answer":"…on a walk neither of us suggested out loud."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000114', 'Elena', '1990-04-06', 'nonbinary',
  ARRAY['woman']::text[], 28, 39, ARRAY['vegetarian cooking','pottery','cooking','startups','cats']::text[],
  'Avondale Estates', 177, 'public defender',
  '[]'::jsonb, '[{"prompt_id":"prompt_09","answer":"…cooking for more people than I have chairs for."},{"prompt_id":"prompt_12","answer":"…to have been genuinely surprised at least once."},{"prompt_id":"prompt_02","answer":"…us realising we''ve been at the table two hours past closing."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000115', 'Beau', '1989-05-14', 'man',
  ARRAY['man','woman']::text[], 30, 40, ARRAY['stand-up','coffee','pickup basketball','dive bars','board games']::text[],
  'Roswell', 161, 'librarian',
  '[]'::jsonb, '[{"prompt_id":"prompt_12","answer":"…fewer, better conversations. That''s the whole ask."},{"prompt_id":"prompt_10","answer":"…drove to Savannah for a sandwich. It was worth it. I''d do it again."},{"prompt_id":"prompt_11","answer":"Grits do not need sugar and I''ll die on this."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000116', 'Aaliyah', '1987-04-19', 'woman',
  ARRAY['man']::text[], 32, 42, ARRAY['pottery','karaoke','live music','sewing','politics','cooking','dogs','photography']::text[],
  'Stone Mountain', 155, 'physical therapist',
  '[]'::jsonb, '[{"prompt_id":"prompt_04","answer":"I''m genuinely happy for people, including strangers."},{"prompt_id":"prompt_06","answer":"Cilantro. Fourteen years of being wrong, corrected in one meal."},{"prompt_id":"prompt_02","answer":"…with both of us already arguing about where to go next time."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000117', 'Nico', '1995-01-22', 'nonbinary',
  ARRAY['nonbinary']::text[], 26, 40, ARRAY['theatre','sewing','pickup basketball','fishing','startups']::text[],
  'Douglasville', 173, 'ER nurse',
  '[]'::jsonb, '[{"prompt_id":"prompt_09","answer":"…in the third hour of a project I said would take one."},{"prompt_id":"prompt_01","answer":"I know exactly which Publix to avoid on a Sunday."},{"prompt_id":"prompt_11","answer":"A hot dog is a sandwich and the debate is beneath us."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000118', 'Tessa', '2002-11-24', 'man',
  ARRAY['woman']::text[], 21, 31, ARRAY['photography','board games','volunteering','cooking','live music','stand-up','dive bars','brunch','cycling','history']::text[],
  'Cabbagetown', 177, 'barista and sometime potter',
  '[]'::jsonb, '[{"prompt_id":"prompt_08","answer":"A toddler at the market told me my haircut was ''a choice''."},{"prompt_id":"prompt_01","answer":"I have opinions about which stretch of the Beltline is best at 7am."},{"prompt_id":"prompt_05","answer":"…I narrate documentaries out loud. Every time."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000119', 'Malik', '1996-10-20', 'woman',
  ARRAY['man']::text[], 22, 37, ARRAY['climbing','pickup basketball','vegetarian cooking','natural wine','motorcycles','karaoke','travel','running','history','pottery']::text[],
  'College Park', 186, 'landscape architect',
  '[]'::jsonb, '[{"prompt_id":"prompt_04","answer":"I''m genuinely happy for people, including strangers."},{"prompt_id":"prompt_09","answer":"…cooking for more people than I have chairs for."},{"prompt_id":"prompt_08","answer":"My neighbour''s dog has learned to open the screen door and act innocent."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000120', 'Junie', '1989-07-06', 'nonbinary',
  ARRAY['nonbinary']::text[], 31, 44, ARRAY['baking','cats','politics','stand-up','cars','startups']::text[],
  'Downtown', 168, 'structural engineer',
  '[]'::jsonb, '[{"prompt_id":"prompt_06","answer":"That being busy meant anything at all."},{"prompt_id":"prompt_05","answer":"…I will absolutely reorganise your kitchen if you leave me alone in it."},{"prompt_id":"prompt_04","answer":"I say the awkward thing early instead of letting it sit."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000121', 'Ravi', '1996-11-26', 'man',
  ARRAY['woman']::text[], 24, 33, ARRAY['sewing','vegetarian cooking','lifting','cats','startups','karaoke']::text[],
  'Alpharetta', 162, 'landscape architect',
  '[]'::jsonb, '[{"prompt_id":"prompt_01","answer":"I still call it the Sears building and I will not be taking questions."},{"prompt_id":"prompt_06","answer":"Cilantro. Fourteen years of being wrong, corrected in one meal."},{"prompt_id":"prompt_08","answer":"My own attempt at a sourdough starter. It''s named and it''s failing."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000122', 'Cleo', '1988-04-26', 'woman',
  ARRAY['man']::text[], 33, 48, ARRAY['baking','live music','travel','podcasts','vegetarian cooking','investing','cats','reading','thrifting']::text[],
  'Avondale Estates', 161, 'brewer',
  '[]'::jsonb, '[{"prompt_id":"prompt_01","answer":"I still call it the Sears building and I will not be taking questions."},{"prompt_id":"prompt_09","answer":"…cooking for more people than I have chairs for."},{"prompt_id":"prompt_12","answer":"…fewer, better conversations. That''s the whole ask."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000123', 'Owen', '2002-11-16', 'nonbinary',
  ARRAY['nonbinary']::text[], 21, 30, ARRAY['theatre','barbecue','history','yoga','natural wine','lifting']::text[],
  'East Atlanta', 188, 'electrician',
  '[]'::jsonb, '[{"prompt_id":"prompt_10","answer":"…drove to Savannah for a sandwich. It was worth it. I''d do it again."},{"prompt_id":"prompt_09","answer":"…cooking for more people than I have chairs for."},{"prompt_id":"prompt_12","answer":"…to have been genuinely surprised at least once."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000124', 'Sade', '1989-06-28', 'man',
  ARRAY['woman','nonbinary']::text[], 30, 41, ARRAY['dive bars','cooking','video games','stand-up','climbing','investing','pickup basketball']::text[],
  'Vinings', 167, 'barista and sometime potter',
  '[]'::jsonb, '[{"prompt_id":"prompt_12","answer":"…to have been genuinely surprised at least once."},{"prompt_id":"prompt_10","answer":"…drove to Savannah for a sandwich. It was worth it. I''d do it again."},{"prompt_id":"prompt_01","answer":"I know exactly which Publix to avoid on a Sunday."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000125', 'Bennett', '1988-03-14', 'woman',
  ARRAY['woman']::text[], 31, 43, ARRAY['trivia','live music','dogs','history','running','climbing','writing','pickup basketball','painting']::text[],
  'Old Fourth Ward', 156, 'electrician',
  '[]'::jsonb, '[{"prompt_id":"prompt_03","answer":"Why every good bakery smells slightly different."},{"prompt_id":"prompt_07","answer":"…you want someone who texts back within the hour. I''m a once-a-day person."},{"prompt_id":"prompt_01","answer":"I still call it the Sears building and I will not be taking questions."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000126', 'Yara', '1996-12-04', 'nonbinary',
  ARRAY['man','woman','nonbinary']::text[], 26, 34, ARRAY['cooking','coffee','cycling','thrifting','motorcycles']::text[],
  'Old Fourth Ward', 162, 'sound engineer',
  '[]'::jsonb, '[{"prompt_id":"prompt_05","answer":"…I''m early to everything and slightly smug about it."},{"prompt_id":"prompt_07","answer":"…you''re looking for something casual. I''m not, and I''d rather say so."},{"prompt_id":"prompt_10","answer":"…drove to Savannah for a sandwich. It was worth it. I''d do it again."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000127', 'Cyrus', '2001-04-27', 'man',
  ARRAY['woman']::text[], 21, 33, ARRAY['hiking','cooking','thrifting','cycling','baking','theatre']::text[],
  'Stone Mountain', 186, 'structural engineer',
  '[]'::jsonb, '[{"prompt_id":"prompt_07","answer":"…quiet Sundays sound like a waste of a weekend to you."},{"prompt_id":"prompt_05","answer":"…I narrate documentaries out loud. Every time."},{"prompt_id":"prompt_06","answer":"Cilantro. Fourteen years of being wrong, corrected in one meal."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000128', 'Delia', '2002-07-12', 'woman',
  ARRAY['man']::text[], 21, 29, ARRAY['film','astronomy','thrifting','karaoke','fishing','dogs']::text[],
  'Inman Park', 189, 'florist',
  '[]'::jsonb, '[{"prompt_id":"prompt_07","answer":"…quiet Sundays sound like a waste of a weekend to you."},{"prompt_id":"prompt_10","answer":"…rebuilt an engine off a library book and it actually started."},{"prompt_id":"prompt_02","answer":"…with both of us already arguing about where to go next time."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000129', 'Amos', '1998-12-22', 'nonbinary',
  ARRAY['nonbinary']::text[], 23, 36, ARRAY['board games','pickup basketball','photography','woodworking','gardening']::text[],
  'Downtown', 167, 'public defender',
  '[]'::jsonb, '[{"prompt_id":"prompt_10","answer":"…drove to Savannah for a sandwich. It was worth it. I''d do it again."},{"prompt_id":"prompt_01","answer":"I still call it the Sears building and I will not be taking questions."},{"prompt_id":"prompt_02","answer":"…us realising we''ve been at the table two hours past closing."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000130', 'Noor', '1993-04-07', 'man',
  ARRAY['man']::text[], 28, 36, ARRAY['live music','pottery','coffee','running','volunteering','stand-up','natural wine','farmers markets','cats','fishing']::text[],
  'Marietta', 176, 'florist',
  '[]'::jsonb, '[{"prompt_id":"prompt_03","answer":"The Braves'' bullpen management. Bring a chair."},{"prompt_id":"prompt_08","answer":"My own attempt at a sourdough starter. It''s named and it''s failing."},{"prompt_id":"prompt_11","answer":"Restaurant butter should be room temperature or it''s a hostility."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000131', 'Reggie', '1992-04-19', 'woman',
  ARRAY['woman']::text[], 28, 39, ARRAY['cats','coffee','soccer','painting','photography']::text[],
  'Alpharetta', 174, 'public defender',
  '[]'::jsonb, '[{"prompt_id":"prompt_07","answer":"…you want someone who texts back within the hour. I''m a once-a-day person."},{"prompt_id":"prompt_08","answer":"My own attempt at a sourdough starter. It''s named and it''s failing."},{"prompt_id":"prompt_06","answer":"Cilantro. Fourteen years of being wrong, corrected in one meal."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000132', 'Fionna', '1990-11-13', 'nonbinary',
  ARRAY['nonbinary']::text[], 32, 42, ARRAY['cooking','astronomy','cats','cars','stand-up','painting','startups','fishing']::text[],
  'Doraville', 161, 'paramedic',
  '[]'::jsonb, '[{"prompt_id":"prompt_02","answer":"…on a walk neither of us suggested out loud."},{"prompt_id":"prompt_07","answer":"…quiet Sundays sound like a waste of a weekend to you."},{"prompt_id":"prompt_04","answer":"I say the awkward thing early instead of letting it sit."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000133', 'Damon', '1990-05-01', 'man',
  ARRAY['woman']::text[], 30, 41, ARRAY['reading','lifting','climbing','farmers markets','trivia','volunteering','sewing']::text[],
  'Riverdale', 183, 'paramedic',
  '[]'::jsonb, '[{"prompt_id":"prompt_03","answer":"The specific genius of a well-made public bus route."},{"prompt_id":"prompt_08","answer":"My neighbour''s dog has learned to open the screen door and act innocent."},{"prompt_id":"prompt_02","answer":"…on a walk neither of us suggested out loud."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000134', 'Perla', '1994-04-17', 'woman',
  ARRAY['man']::text[], 24, 40, ARRAY['farmers markets','live music','camping','running','cycling','climbing','theatre','stand-up','dive bars','yoga']::text[],
  'Dunwoody', 169, 'urban planner',
  '[]'::jsonb, '[{"prompt_id":"prompt_06","answer":"That being busy meant anything at all."},{"prompt_id":"prompt_01","answer":"I still call it the Sears building and I will not be taking questions."},{"prompt_id":"prompt_02","answer":"…us realising we''ve been at the table two hours past closing."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000135', 'Silas', '1989-06-25', 'nonbinary',
  ARRAY['nonbinary']::text[], 32, 41, ARRAY['politics','dive bars','writing','cycling','live music','stand-up','hiking','cats','investing']::text[],
  'Norcross', 184, 'barista and sometime potter',
  '[]'::jsonb, '[{"prompt_id":"prompt_03","answer":"The specific genius of a well-made public bus route."},{"prompt_id":"prompt_08","answer":"My neighbour''s dog has learned to open the screen door and act innocent."},{"prompt_id":"prompt_02","answer":"…us realising we''ve been at the table two hours past closing."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000136', 'Adaeze', '1999-05-12', 'man',
  ARRAY['woman']::text[], 23, 30, ARRAY['coffee','live music','woodworking','sewing','reading','investing']::text[],
  'Westside / Howell Mill', 181, 'bike mechanic',
  '[]'::jsonb, '[{"prompt_id":"prompt_08","answer":"My neighbour''s dog has learned to open the screen door and act innocent."},{"prompt_id":"prompt_12","answer":"…to have been genuinely surprised at least once."},{"prompt_id":"prompt_06","answer":"That being busy meant anything at all."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000137', 'Gus', '1997-06-08', 'woman',
  ARRAY['man']::text[], 22, 38, ARRAY['yoga','gardening','dive bars','woodworking','barbecue','natural wine','pottery','soccer']::text[],
  'Roswell', 187, 'barista and sometime potter',
  '[]'::jsonb, '[{"prompt_id":"prompt_07","answer":"…you''re looking for something casual. I''m not, and I''d rather say so."},{"prompt_id":"prompt_05","answer":"…I will absolutely reorganise your kitchen if you leave me alone in it."},{"prompt_id":"prompt_11","answer":"A hot dog is a sandwich and the debate is beneath us."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000138', 'Lark', '2003-10-06', 'nonbinary',
  ARRAY['man','woman','nonbinary']::text[], 21, 30, ARRAY['cooking','soccer','yoga','painting','brunch','trivia']::text[],
  'Marietta', 172, 'sound engineer',
  '[]'::jsonb, '[{"prompt_id":"prompt_01","answer":"I still call it the Sears building and I will not be taking questions."},{"prompt_id":"prompt_02","answer":"…with both of us already arguing about where to go next time."},{"prompt_id":"prompt_10","answer":"…accidentally joined a wedding photo and got sent the prints."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;
insert into profiles (
  id, first_name, birthdate, gender, seeking, age_min, age_max, interests,
  neighborhood, height_cm, occupation, photos, prompts, status, created_at, updated_at
) values (
  'deadbeef-0000-4000-8000-000000000139', 'Emmett', '2002-03-14', 'man',
  ARRAY['woman']::text[], 21, 34, ARRAY['film','video games','gardening','woodworking','live music']::text[],
  'Hapeville', 189, 'electrician',
  '[]'::jsonb, '[{"prompt_id":"prompt_10","answer":"…drove to Savannah for a sandwich. It was worth it. I''d do it again."},{"prompt_id":"prompt_12","answer":"…fewer, better conversations. That''s the whole ask."},{"prompt_id":"prompt_01","answer":"I know exactly which Publix to avoid on a Sunday."}]'::jsonb, 'active'::member_status,
  '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
) on conflict (id) do nothing;

-- ============ MEMBERSHIPS ============
-- 84 claimed seats drive the marketing counter; the first
-- 40 are these profiles, and the rest are recorded as paid seats without a
-- profile so the number on the hero is real without inventing more people.
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000200', 'deadbeef-0000-4000-8000-000000000100', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_0',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000201', 'deadbeef-0000-4000-8000-000000000101', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_1',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000202', 'deadbeef-0000-4000-8000-000000000102', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_2',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000203', 'deadbeef-0000-4000-8000-000000000103', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_3',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000204', 'deadbeef-0000-4000-8000-000000000104', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_4',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000205', 'deadbeef-0000-4000-8000-000000000105', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_5',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000206', 'deadbeef-0000-4000-8000-000000000106', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_6',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000207', 'deadbeef-0000-4000-8000-000000000107', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_7',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000208', 'deadbeef-0000-4000-8000-000000000108', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_8',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000209', 'deadbeef-0000-4000-8000-000000000109', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_9',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000210', 'deadbeef-0000-4000-8000-000000000110', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_10',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000211', 'deadbeef-0000-4000-8000-000000000111', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_11',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000212', 'deadbeef-0000-4000-8000-000000000112', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_12',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000213', 'deadbeef-0000-4000-8000-000000000113', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_13',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000214', 'deadbeef-0000-4000-8000-000000000114', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_14',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000215', 'deadbeef-0000-4000-8000-000000000115', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_15',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000216', 'deadbeef-0000-4000-8000-000000000116', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_16',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000217', 'deadbeef-0000-4000-8000-000000000117', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_17',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000218', 'deadbeef-0000-4000-8000-000000000118', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_18',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000219', 'deadbeef-0000-4000-8000-000000000119', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_19',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000220', 'deadbeef-0000-4000-8000-000000000120', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_20',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000221', 'deadbeef-0000-4000-8000-000000000121', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_21',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000222', 'deadbeef-0000-4000-8000-000000000122', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_22',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000223', 'deadbeef-0000-4000-8000-000000000123', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_23',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000224', 'deadbeef-0000-4000-8000-000000000124', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_24',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000225', 'deadbeef-0000-4000-8000-000000000125', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_25',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000226', 'deadbeef-0000-4000-8000-000000000126', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_26',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000227', 'deadbeef-0000-4000-8000-000000000127', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_27',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000228', 'deadbeef-0000-4000-8000-000000000128', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_28',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000229', 'deadbeef-0000-4000-8000-000000000129', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_29',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000230', 'deadbeef-0000-4000-8000-000000000130', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_30',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000231', 'deadbeef-0000-4000-8000-000000000131', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_31',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000232', 'deadbeef-0000-4000-8000-000000000132', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_32',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000233', 'deadbeef-0000-4000-8000-000000000133', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_33',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000234', 'deadbeef-0000-4000-8000-000000000134', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_34',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000235', 'deadbeef-0000-4000-8000-000000000135', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_35',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000236', 'deadbeef-0000-4000-8000-000000000136', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_36',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000237', 'deadbeef-0000-4000-8000-000000000137', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_37',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000238', 'deadbeef-0000-4000-8000-000000000138', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_38',
  4000)
on conflict (user_id, season_id) do nothing;
insert into season_members (id, user_id, season_id, stripe_payment_intent, price_paid_cents)
values ('deadbeef-0000-4000-8000-000000000239', 'deadbeef-0000-4000-8000-000000000139', 'deadbeef-0000-4000-8000-000000000001', 'pi_seed_39',
  4000)
on conflict (user_id, season_id) do nothing;

-- ============ APPLICATIONS ============
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000300', 'deadbeef-0000-4000-8000-000000000100', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000301', 'deadbeef-0000-4000-8000-000000000101', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000302', 'deadbeef-0000-4000-8000-000000000102', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000303', 'deadbeef-0000-4000-8000-000000000103', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000304', 'deadbeef-0000-4000-8000-000000000104', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000305', 'deadbeef-0000-4000-8000-000000000105', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000306', 'deadbeef-0000-4000-8000-000000000106', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000307', 'deadbeef-0000-4000-8000-000000000107', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000308', 'deadbeef-0000-4000-8000-000000000108', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000309', 'deadbeef-0000-4000-8000-000000000109', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000310', 'deadbeef-0000-4000-8000-000000000110', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000311', 'deadbeef-0000-4000-8000-000000000111', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000312', 'deadbeef-0000-4000-8000-000000000112', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000313', 'deadbeef-0000-4000-8000-000000000113', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000314', 'deadbeef-0000-4000-8000-000000000114', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000315', 'deadbeef-0000-4000-8000-000000000115', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000316', 'deadbeef-0000-4000-8000-000000000116', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000317', 'deadbeef-0000-4000-8000-000000000117', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000318', 'deadbeef-0000-4000-8000-000000000118', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000319', 'deadbeef-0000-4000-8000-000000000119', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000320', 'deadbeef-0000-4000-8000-000000000120', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000321', 'deadbeef-0000-4000-8000-000000000121', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000322', 'deadbeef-0000-4000-8000-000000000122', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000323', 'deadbeef-0000-4000-8000-000000000123', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000324', 'deadbeef-0000-4000-8000-000000000124', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000325', 'deadbeef-0000-4000-8000-000000000125', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000326', 'deadbeef-0000-4000-8000-000000000126', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000327', 'deadbeef-0000-4000-8000-000000000127', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000328', 'deadbeef-0000-4000-8000-000000000128', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000329', 'deadbeef-0000-4000-8000-000000000129', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000330', 'deadbeef-0000-4000-8000-000000000130', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000331', 'deadbeef-0000-4000-8000-000000000131', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000332', 'deadbeef-0000-4000-8000-000000000132', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000333', 'deadbeef-0000-4000-8000-000000000133', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000334', 'deadbeef-0000-4000-8000-000000000134', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000335', 'deadbeef-0000-4000-8000-000000000135', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000336', 'deadbeef-0000-4000-8000-000000000136', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000337', 'deadbeef-0000-4000-8000-000000000137', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000338', 'deadbeef-0000-4000-8000-000000000138', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;
insert into applications (id, user_id, season_id, status, admitted_at, claim_deadline)
values ('deadbeef-0000-4000-8000-000000000339', 'deadbeef-0000-4000-8000-000000000139', 'deadbeef-0000-4000-8000-000000000001', 'claimed'::application_status,
  now() - interval '10 days', now() - interval '7 days')
on conflict (user_id, season_id) do nothing;

-- ============ NOTIFICATION PREFS ============
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000100') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000101') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000102') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000103') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000104') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000105') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000106') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000107') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000108') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000109') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000110') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000111') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000112') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000113') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000114') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000115') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000116') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000117') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000118') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000119') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000120') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000121') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000122') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000123') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000124') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000125') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000126') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000127') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000128') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000129') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000130') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000131') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000132') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000133') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000134') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000135') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000136') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000137') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000138') on conflict (user_id) do nothing;
insert into notification_prefs (user_id) values ('deadbeef-0000-4000-8000-000000000139') on conflict (user_id) do nothing;

commit;

-- ============ PURGE ============
-- Admin-purgeable in one call (spec §10 Phase 0).
create or replace function purge_seed_data()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from auth.users where id::text like 'deadbeef-%';
  delete from seasons  where id::text like 'deadbeef-%';
end;
$$;

comment on function purge_seed_data is
  'Removes every seeded row. Profiles, memberships and applications cascade from auth.users.';

revoke execute on function purge_seed_data() from public, anon, authenticated;
