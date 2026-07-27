-- NoGhost — the drop and the connect inbox. Spec §5, §6.1, §6.2.

-- ============ THE DROP ============

create table drops (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  user_id uuid not null references profiles(id) on delete cascade,
  drop_date date not null,
  released_at timestamptz,                    -- null until the 8pm release
  created_at timestamptz not null default now(),
  unique (user_id, season_id, drop_date)
);

comment on column drops.released_at is
  'Null means built but not yet visible. The 8pm cron flips this; RLS keys off it.';

create index drops_release_idx on drops (season_id, drop_date)
  where released_at is null;

create table drop_cards (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references drops(id) on delete cascade,
  shown_profile_id uuid not null references profiles(id) on delete cascade,
  is_encore boolean not null default false,
  action card_action not null default 'pending',
  acted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (drop_id, shown_profile_id)
);

create index drop_cards_drop_idx on drop_cards (drop_id);
create index drop_cards_shown_idx on drop_cards (shown_profile_id);

-- Encore eligibility asks "did this viewer pass on this profile, and in which
-- week" — a hot query on every drop build for every member.
create index drop_cards_passed_idx on drop_cards (shown_profile_id, acted_at)
  where action = 'passed';

-- ============ CONNECTS (THE INBOX) ============

create table connects (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  from_user uuid not null references profiles(id) on delete cascade,
  to_user uuid not null references profiles(id) on delete cascade,
  drop_card_id uuid not null references drop_cards(id),
  prompt_ref jsonb not null,                  -- {type:'prompt'|'photo', id}
  reply_text text check (length(reply_text) <= 1000),
  reply_voice_path text,
  status connect_status not null default 'pending',
  responded_at timestamptz,
  nudged_at timestamptz,                      -- the single 72h nudge (§6.2)
  created_at timestamptz not null default now(),

  -- One shot per person per season. A decline is final and cannot be re-sent.
  unique (from_user, to_user, season_id),

  -- There is no "like" — a connect must carry an actual reply.
  constraint reply_present check (
    reply_text is not null or reply_voice_path is not null
  ),
  constraint no_self_connect check (from_user <> to_user)
);

create index connects_inbox_idx on connects (to_user, status);
create index connects_sent_idx on connects (from_user, status);
create index connects_nudge_idx on connects (created_at)
  where status = 'pending' and nudged_at is null;

comment on constraint reply_present on connects is
  'Spec §6.2: "Reply to something specific. It is the only way to say hello here."';
