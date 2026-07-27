-- NoGhost — extensions, domains, enums.
-- Spec §5. This is the dedicated NoGhost Supabase project (locked decision #17);
-- it must never share a project with anything else, because it holds PII.

create extension if not exists "pgcrypto";  -- gen_random_uuid()
create extension if not exists "citext";    -- case-insensitive email

-- ============ DOMAINS ============

-- Spec §5 writes `phone e164 text unique`, which isn't valid SQL. The intent is
-- an E.164-constrained text column, and it appears on two tables — so it gets a
-- real domain rather than a repeated CHECK.
create domain e164 as text
  check (value ~ '^\+[1-9]\d{1,14}$');

comment on domain e164 is
  'E.164 phone number, e.g. +14045550134. Enforced at the type level.';

-- ============ ENUMS ============

create type application_status as enum
  ('applied','phone_verified','selfie_submitted','under_review',
   'admitted','claimed','waitlisted','rejected','expired');

create type season_phase as enum
  ('draft','applications_open','pre_season','live','finale_week','closed');

create type member_status as enum
  ('active','paused','found_someone','removed','season_complete');

create type card_action as enum ('pending','connected','passed');

create type connect_status as enum ('pending','accepted','declined','expired');

create type chat_state as enum
  ('active','date_scheduled','post_date_checkin','closed_fuse',
   'closed_by_user','closed_graduated','closed_season_end');

create type message_kind as enum ('text','voice','system');

create type date_status as enum ('proposed','confirmed','declined','completed','cancelled');

create type checkin_answer as enum ('continue','close','no_response');

create type notif_channel as enum ('push','sms','email','inapp');

-- ============ ADMIN IDENTITY ============
-- Not in spec §5, but required: every table's RLS references "admin", and RLS
-- cannot read the ADMIN_EMAILS env var from §7.3. The admin app syncs this
-- table from that allow-list at deploy time; TOTP and password remain the
-- app-layer factors.
create table admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table admin_users enable row level security;

-- security definer so it can read admin_users from inside another table's
-- policy without that policy needing its own grant.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from admin_users
    where id = (select auth.uid()) and active
  );
$$;

comment on function is_admin is
  'True when the caller is an active admin. Used by every admin RLS policy.';

create policy "admins read the allow-list"
  on admin_users for select
  to authenticated
  using (is_admin());
