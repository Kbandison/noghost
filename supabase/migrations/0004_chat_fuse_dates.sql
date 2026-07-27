-- NoGhost — chat, the fuse, dates, check-ins, closure notes. Spec §5, §6.3.

create table chats (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  connect_id uuid not null unique references connects(id),
  user_a uuid not null references profiles(id) on delete cascade,
  user_b uuid not null references profiles(id) on delete cascade,
  state chat_state not null default 'active',
  fuse_expires_at timestamptz not null,       -- accepted_at + season.fuse_days
  fuse_paused_at timestamptz,
  warned_48h boolean not null default false,
  warned_24h boolean not null default false,
  closed_at timestamptz,
  created_at timestamptz not null default now(),

  constraint distinct_participants check (user_a <> user_b),
  -- A closed chat has a closing time, and an open one does not. The fuse sweep
  -- and the admin cohort metrics both depend on this holding.
  constraint closed_has_timestamp check (
    (state in ('closed_fuse','closed_by_user','closed_graduated','closed_season_end'))
      = (closed_at is not null)
  )
);

-- The hourly fuse sweep scans exactly this.
create index chats_sweep_idx on chats (state, fuse_expires_at);
create index chats_user_a_idx on chats (user_a, state);
create index chats_user_b_idx on chats (user_b, state);

create table messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references chats(id) on delete cascade,
  sender_id uuid references profiles(id) on delete set null,  -- null = system
  kind message_kind not null default 'text',
  body text check (length(body) <= 4000),
  voice_path text,
  voice_duration_ms int check (voice_duration_ms between 0 and 300000),
  read_at timestamptz,
  created_at timestamptz not null default now(),

  constraint content_present check (
    (kind = 'text'  and body is not null)
    or (kind = 'voice' and voice_path is not null)
    or (kind = 'system' and body is not null)
  ),
  -- A system message has no sender; a member message must have one.
  constraint system_has_no_sender check ((kind = 'system') = (sender_id is null))
);

create index messages_chat_idx on messages (chat_id, created_at);
create index messages_unread_idx on messages (chat_id) where read_at is null;

create table dates (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references chats(id) on delete cascade,
  proposed_by uuid not null references profiles(id) on delete cascade,
  status date_status not null default 'proposed',
  scheduled_for timestamptz not null,
  place_name text not null check (length(trim(place_name)) between 2 and 120),
  place_note text check (length(place_note) <= 200),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),

  constraint confirmed_has_timestamp check (
    (status = 'confirmed') = (confirmed_at is not null)
  )
);

comment on table dates is
  'A row with status=confirmed is the only thing that pauses a fuse (spec §6.3).';

create index dates_chat_idx on dates (chat_id, created_at desc);
-- The check-in sweep looks for confirmed dates whose time has passed.
create index dates_checkin_idx on dates (scheduled_for) where status = 'confirmed';

create table date_checkins (
  id uuid primary key default gen_random_uuid(),
  date_id uuid not null references dates(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  answer checkin_answer not null default 'no_response',
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (date_id, user_id)
);

comment on table date_checkins is
  'A participant never sees the other side''s raw answer — only the outcome.';

create table closure_notes (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references chats(id) on delete cascade,
  from_user uuid references profiles(id) on delete set null,  -- null = system
  template_id text not null,
  personal_line text check (length(personal_line) <= 500),
  tone_check_passed boolean,                  -- null = not run (template only, or outage)
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table closure_notes is
  'Every ending on NoGhost has a row here. This table is the product promise.';

create index closure_notes_chat_idx on closure_notes (chat_id);

-- Graduation proposals — spec §6.5. Declining is private, so a declined row is
-- never surfaced to the proposer.
create table graduations (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references chats(id) on delete cascade,
  proposed_by uuid not null references profiles(id) on delete cascade,
  confirmed_by uuid references profiles(id) on delete set null,
  status text not null default 'proposed'
    check (status in ('proposed','confirmed','declined')),
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create index graduations_chat_idx on graduations (chat_id, status);

-- Exit survey — three questions, captured at graduation or season end (§6.5).
create table exit_surveys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  season_id uuid not null references seasons(id),
  dates_count int check (dates_count >= 0),
  would_recommend boolean,
  quote text check (length(quote) <= 500),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, season_id)
);
