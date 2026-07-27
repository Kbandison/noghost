-- NoGhost — identity, seasons, admissions. Spec §5.

-- ============ PROFILES ============

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null check (length(trim(first_name)) between 1 and 40),
  birthdate date not null,                    -- age computed, never stored
  gender text not null check (gender in ('man','woman','nonbinary')),
  seeking text[] not null check (
    array_length(seeking, 1) between 1 and 3
    and seeking <@ array['man','woman','nonbinary']
  ),

  -- Not in spec §5, but required by spec §6.1 and §7.2: the drop's hard age
  -- filter and its interest-overlap score have no columns to read otherwise,
  -- and onboarding collects both. Flagged for the spec's decision log.
  age_min int not null default 21 check (age_min >= 21),
  age_max int not null default 99 check (age_max >= age_min),
  interests text[] not null default '{}' check (array_length(interests, 1) <= 10),

  neighborhood text,
  height_cm int check (height_cm between 120 and 250),
  occupation text check (length(occupation) <= 80),
  photos jsonb not null default '[]',         -- [{path, order, approved}] max 6
  prompts jsonb not null default '[]',        -- [{prompt_id, answer}] exactly 3
  voice_intro_path text,
  phone e164 unique,
  status member_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint photos_is_array check (jsonb_typeof(photos) = 'array'),
  constraint photos_max_six check (jsonb_array_length(photos) <= 6),
  constraint prompts_is_array check (jsonb_typeof(prompts) = 'array'),
  constraint prompts_max_three check (jsonb_array_length(prompts) <= 3)
);

create index profiles_status_idx on profiles (status);
create index profiles_gender_idx on profiles (gender);
create index profiles_interests_idx on profiles using gin (interests);

comment on column profiles.birthdate is
  'Age is computed from this on read. The raw date never leaves the server.';

-- ============ VERIFICATIONS ============

create table verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  phone_verified_at timestamptz,
  selfie_path text,                           -- private bucket; no client read, ever
  liveness_score numeric,
  liveness_passed boolean,
  admin_reviewed_by uuid references profiles(id),
  admin_decision text check (admin_decision in ('approved','rejected')),
  admin_notes text,                           -- never exposed to the member
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id)
);

create index verifications_pending_idx on verifications (reviewed_at)
  where reviewed_at is null;

-- ============ SEASONS ============

create table seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  phase season_phase not null default 'draft',
  applications_open_at timestamptz,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  member_cap int not null default 300 check (member_cap > 0),
  drop_time time not null default '20:00',
  drop_max int not null default 3 check (drop_max > 0),
  fuse_days int not null default 7 check (fuse_days > 0),
  claim_hours int not null default 72 check (claim_hours > 0),
  price_early_cents int not null default 4000 check (price_early_cents >= 0),
  price_standard_cents int not null default 5000 check (price_standard_cents >= 0),
  early_bird_cap int not null default 100 check (early_bird_cap >= 0),
  encore_start_week int not null default 5 check (encore_start_week > 0),
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

comment on table seasons is
  'Every mechanic reads its configuration from this row. Spec §5: nothing hardcoded.';

create index seasons_phase_idx on seasons (phase);

-- ============ APPLICATIONS ============

create table applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  season_id uuid not null references seasons(id),
  status application_status not null default 'applied',
  admitted_at timestamptz,
  claim_deadline timestamptz,                 -- admitted_at + season.claim_hours
  waitlist_position int,
  rejection_reason text,                      -- internal only, never shown
  created_at timestamptz not null default now(),
  unique (user_id, season_id)
);

create index applications_season_status_idx on applications (season_id, status);
create index applications_claim_deadline_idx on applications (claim_deadline)
  where status = 'admitted';

-- ============ SEASON MEMBERS ============

create table season_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  season_id uuid not null references seasons(id),
  stripe_payment_intent text not null unique,
  price_paid_cents int not null check (price_paid_cents >= 0),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, season_id)
);

comment on column season_members.stripe_payment_intent is
  'Unique, so a replayed Stripe webhook cannot create a second membership.';

create index season_members_season_idx on season_members (season_id);

-- ============ SEATS REMAINING (marketing site) ============
-- The live counter on the hero is a real number (spec §7.1), but the marketing
-- site is public and cached — it must never run a per-visitor count against a
-- PII table. This view exposes exactly two integers and nothing else.
create view public_season_stats
with (security_invoker = false) as
  select
    s.id,
    s.name,
    s.city,
    s.phase,
    s.starts_at,
    s.ends_at,
    s.member_cap,
    s.claim_hours,
    s.applications_open_at,
    s.price_early_cents,
    s.price_standard_cents,
    s.early_bird_cap,
    s.timezone,
    greatest(s.member_cap - (
      select count(*) from season_members m where m.season_id = s.id
    ), 0)::int as seats_remaining
  from seasons s
  where s.phase in ('applications_open','pre_season','live','finale_week');

comment on view public_season_stats is
  'Anon-safe season summary for the marketing site. No PII crosses this view.';
