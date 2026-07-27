-- NoGhost — safety, waitlist, notifications, admin audit. Spec §5.

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  reported_id uuid not null references profiles(id) on delete cascade,
  chat_id uuid references chats(id) on delete set null,
  reason text not null,
  detail text check (length(detail) <= 2000),
  resolved_by uuid references profiles(id),
  resolution text check (resolution in ('dismissed','warned','removed')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint no_self_report check (reporter_id <> reported_id)
);

comment on table reports is
  'A report immediately removes both people from each other''s drop eligibility, '
  'before any admin looks at it. Spec §6.1 rule 5.';

-- The drop's eligibility filter reads this on both sides, every night.
create index reports_reporter_idx on reports (reporter_id);
create index reports_reported_idx on reports (reported_id);
create index reports_open_idx on reports (created_at) where resolved_at is null;

create table waitlist (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  phone e164,
  city text not null default 'Atlanta',
  season_interest uuid references seasons(id),
  position int,
  source text,                                -- utm / event code
  created_at timestamptz not null default now(),
  unique (email, city)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  channel notif_channel not null,
  template text not null,                     -- key into the §8 matrix
  payload jsonb not null default '{}',
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on notifications (user_id, created_at desc);
create index notifications_unsent_idx on notifications (created_at) where sent_at is null;

create table notification_prefs (
  user_id uuid primary key references profiles(id) on delete cascade,
  drop_push boolean not null default true,
  drop_sms boolean not null default false,
  fuse_warnings boolean not null default true,
  email_updates boolean not null default true,
  -- TCPA: SMS requires an explicit, separately-recorded opt-in (spec §9.8).
  sms_opt_in_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table notification_prefs is
  'The drop alert and fuse warnings always keep at least one channel; the UI '
  'enforces that, not the database (spec §5).';

create table admin_audit (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null,
  action text not null,
  target_table text,
  target_id uuid,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index admin_audit_created_idx on admin_audit (created_at desc);
create index admin_audit_target_idx on admin_audit (target_table, target_id);

-- Idempotency ledger for external webhooks. BACKEND.md anti-pattern #5: a
-- replayed Stripe event must not create a second membership or a second charge.
create table processed_webhook_events (
  id text primary key,                        -- the provider's event id
  provider text not null,
  processed_at timestamptz not null default now()
);
