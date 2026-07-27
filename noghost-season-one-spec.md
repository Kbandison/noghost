# NoGhost — Season One Build Spec v1.0

**Prepared for:** Claude Code execution
**Product owner:** Kevin Bandison / LuxWeb Studio
**Working title:** NoGhost (`APP_NAME` config constant — rename is a one-line change)
**Launch market:** Atlanta, GA — "Atlanta Season One"

---

## 1. Product Overview

NoGhost is a season-based dating app. Dating runs in named 8-week seasons per city. Everyone starts the same day. Members receive up to 3 curated profiles at 8:00 PM daily (the Drop). Every conversation carries a 7-day fuse: schedule a real date or the chat closes with a kind closure note. Nobody on NoGhost can be ghosted — mechanically.

**The pitch (never explain more than this externally):**
> "Dating in seasons. Everyone starts together. Nobody gets ghosted."

**Business model:** Season pass (one-time entry fee, like a race registration) — NOT a subscription. NoGhost profits from participation, not from keeping users single. Application is free; only admitted members pay.

**Positioning:** The anti-burnout dating app. Intention, scarcity, closure, and accountability as product mechanics, not marketing copy.

**Success criteria for Season One:** One full Atlanta cohort (300 members), season completes with measurable dates scheduled, zero silent endings, and enough demand signal to open Season Two waitlist.

---

## 2. Locked Decisions (Discovery Log)

| # | Decision | Locked Value |
|---|----------|--------------|
| 1 | Platform | Turborepo monorepo — web (Next.js PWA) + mobile (Expo) + admin. **Both web and mobile ship for Season One.** |
| 2 | Name | NoGhost (working title, config-driven) |
| 3 | Surfaces | Marketing site + member app (web & mobile) + admin ops dashboard |
| 4 | Season shape | 8 weeks · 300 member cap · $40 early bird / $50 standard pass |
| 5 | Drop | Up to 3 profiles at 8:00 PM local, daily. Algorithm serves fewer as pool thins. Encore drops in weeks 5–8. |
| 6 | Fuse | 7 days per chat without a mutually confirmed date → auto-close with closure note |
| 7 | Closure notes | Hybrid: 6 templates + optional personal line (tone-checked) |
| 8 | Verification | Phone OTP + selfie liveness + manual admin approval |
| 9 | Connect mechanics | Inbox model. Connect requires replying to a specific prompt. Recipient accepts (chat opens) or declines (kind auto-note sent). **No interaction ends in silence.** |
| 10 | Payment flow | Apply free → verified → admitted → 72-hour claim window to purchase pass |
| 11 | Voice notes | Core chat feature in v1 (first on the cut list only if timeline slips) |
| 12 | Slot cap | NO hard cap in Season One. Fuse-only capacity regulation. Hard cap is a Season Two option if data shows hoarding. |
| 13 | Squad dates | Manual/concierge at season events — ops, not code, in v1 |
| 14 | Lock ceremony / alumni wall | Season Two. V1 ships a minimal "Found Someone" graduation state + exit survey only. |
| 15 | Advisors ("board of directors") | Season Three |
| 16 | App Store risk | Submit mobile 4 weeks pre-season. TestFlight beta for early-bird buyers. Web is the guaranteed fallback. |
| 17 | Infrastructure | **NEW dedicated Supabase project** (PII isolation — do not use shared LuxWeb project) |
| 18 | Payments rail | Stripe Checkout on web. Mobile links out to web checkout (permitted post-Epic ruling, US). No Apple IAP in v1. |

---

## 3. Brand & Copy System

### 3.1 Config constants (`packages/config/src/brand.ts`)

```ts
export const BRAND = {
  APP_NAME: "NoGhost",
  TAGLINE: "Dating with a start date.",
  PITCH: "Dating in seasons. Everyone starts together. Nobody gets ghosted.",
  DOMAIN: "noghost.app",            // verify availability before purchase
  APP_URL: "https://app.noghost.app",
  ADMIN_URL: "https://admin.noghost.app",
  SUPPORT_EMAIL: "hello@noghost.app",
  CITY_S1: "Atlanta",
  SEASON_S1_NAME: "Atlanta Season One",
} as const;
```

All copy references `{{APP_NAME}}`, `{{CITY}}`, `{{SEASON_NAME}}`, `{{SEASON_START_DATE}}`, `{{SEASON_END_DATE}}`, `{{CLAIM_DEADLINE}}` — same variable-schema convention as LuxWeb legal docs. No hardcoded brand strings anywhere in components.

### 3.2 Voice rules

- Warm, direct, human. Short sentences. Zero corporate speak, zero dating-app clichés ("find your person", "spark something real" — banned).
- The product speaks like a good friend who tells you the truth kindly.
- Never shame users for passing, declining, or closing. Closure is framed as respect, not failure.
- The ghost mascot (friendly, minimal line-art ghost) may appear in empty states and the 8 PM drop moment. Playful, never spooky. It is the brand's one joke; don't overuse it.

### 3.3 Banned patterns

- No streaks, no "you have X likes waiting," no engagement-bait notifications.
- No selling exemptions from mechanics (extra drops, fuse extensions, undo-pass). **These are never monetized. Ever.**
- No dark-pattern countdown timers except the two honest ones: the 72-hour claim window and the fuse — both real, both stated plainly.

---

## 4. Architecture

### 4.1 Monorepo layout (Turborepo + pnpm)

```
noghost/
├── apps/
│   ├── web/            # Next.js 15 App Router — marketing + member app
│   │   └── src/app/
│   │       ├── (marketing)/        # noghost.app — public site
│   │       ├── (app)/              # app.noghost.app — member experience
│   │       └── api/                # route handlers, webhooks, cron
│   ├── mobile/         # Expo + Expo Router + NativeWind — member app only
│   └── admin/          # Next.js 15 — admin.noghost.app, separate Vercel deploy
├── packages/
│   ├── config/         # brand constants, season defaults, env schema (zod)
│   ├── types/          # shared TS types (generated Supabase types + domain types)
│   ├── db/             # Supabase clients (browser/server/service), typed queries
│   ├── logic/          # PURE business logic: fuse state machine, drop algorithm,
│   │                   #   tone check, eligibility rules. Zero UI, zero platform APIs.
│   │                   #   100% shared between web, mobile, admin, and cron.
│   └── ui-tokens/      # design tokens (colors, spacing, type scale) consumed by
│                       #   Tailwind (web/admin) and NativeWind (mobile)
├── turbo.json
└── pnpm-workspace.yaml
```

**Critical rule:** all season mechanics live in `packages/logic` as pure functions with unit tests. Web, mobile, and cron jobs call the same functions. No mechanic logic in components — ever.

### 4.2 Services

| Concern | Service | Notes |
|---|---|---|
| DB / Auth / Realtime / Storage | **New** Supabase project | Phone auth (Twilio provider), RLS on every table, Realtime for chat, Storage buckets: `photos`, `voice-notes`, `verification-selfies` (private) |
| Payments | Stripe Checkout + webhooks | One-time pass products: `pass_early_bird` $40, `pass_standard` $50. Mobile opens checkout in browser. |
| Email | Resend | Transactional only (matrix in §8) |
| SMS | Twilio | OTP (via Supabase) + drop alerts + fuse warnings (opt-in) |
| Push | Web Push (PWA) + Expo Push | Drop alert is the flagship notification |
| Hosting | Vercel (web, admin) · EAS (mobile builds) | Vercel Cron for scheduled jobs |
| Moderation | Anthropic API (Claude) | Tone check on personal closure lines + first-message screening; photo review is manual-first in v1 |

### 4.3 Scheduled jobs (Vercel Cron → `apps/web/src/app/api/cron/*`)

| Job | Schedule | Function (from `packages/logic`) |
|---|---|---|
| `generate-drops` | Daily 7:30 PM ET | Build tonight's drop for every active member |
| `release-drops` | Daily 8:00 PM ET | Flip drops to visible; fire push/SMS/email |
| `fuse-sweep` | Hourly | Send 48h/24h warnings; close expired chats with closure notes |
| `claim-sweep` | Hourly | Expire 72-hour claim windows; promote waitlist |
| `checkin-sweep` | Hourly | Open post-date check-ins (date time + 24h); close unanswered check-ins at +72h |
| `season-tick` | Daily 6:00 AM | Season phase transitions (pre-season → live → finale week → closed) |

All cron endpoints verify `CRON_SECRET`. All are idempotent (safe to re-run).

---

## 5. Database Schema (Supabase / Postgres)

Conventions: `uuid` PKs default `gen_random_uuid()`, `created_at timestamptz default now()` on every table (omitted below for brevity), soft deletes via `deleted_at` only where noted. Enums as Postgres types. **RLS enabled on every table** — policy rules follow each table.

```sql
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

-- ============ IDENTITY & ADMISSIONS ============

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  birthdate date not null,                    -- age computed, never stored
  gender text not null,                       -- 'man' | 'woman' | 'nonbinary'
  seeking text[] not null,                    -- array of the above
  neighborhood text,                          -- Atlanta area, free pick-list
  height_cm int,
  occupation text,
  photos jsonb not null default '[]',         -- [{path, order, approved}] max 6
  prompts jsonb not null default '[]',        -- [{prompt_id, answer}] exactly 3
  voice_intro_path text,                      -- optional 30s voice intro
  phone e164 text unique,
  status member_status not null default 'active',
  updated_at timestamptz default now()
);
-- RLS: owner read/write own row (photos/prompts only while season not live-locked
--      fields: name/birthdate/gender frozen after admission — admin override only).
--      Other members: read-only, and ONLY via drop/connect/chat visibility rules
--      (enforced with security-definer view `visible_profiles`, not raw table).
--      Admin service role: full.

create table verifications (
  id uuid primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  phone_verified_at timestamptz,
  selfie_path text,                           -- private bucket
  liveness_score numeric,                     -- from liveness provider
  liveness_passed boolean,
  admin_reviewed_by uuid references profiles(id),
  admin_decision text,                        -- 'approved' | 'rejected' | null
  admin_notes text,
  reviewed_at timestamptz
);
-- RLS: owner may INSERT selfie + read own status fields (never admin_notes).
--      Admin: full. Selfie bucket: no public access, signed URLs admin-only.

create table seasons (
  id uuid primary key,
  name text not null,                         -- 'Atlanta Season One'
  city text not null,
  phase season_phase not null default 'draft',
  applications_open_at timestamptz,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  member_cap int not null default 300,
  drop_time time not null default '20:00',
  drop_max int not null default 3,
  fuse_days int not null default 7,
  claim_hours int not null default 72,
  price_early_cents int not null default 4000,
  price_standard_cents int not null default 5000,
  early_bird_cap int not null default 100,    -- first N admits get early price
  encore_start_week int not null default 5,
  timezone text not null default 'America/New_York'
);
-- RLS: authenticated read (public marketing needs open seasons via anon-safe view).
--      Admin: full. ALL mechanics read config from this row — nothing hardcoded.

create table applications (
  id uuid primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  season_id uuid not null references seasons(id),
  status application_status not null default 'applied',
  admitted_at timestamptz,
  claim_deadline timestamptz,                 -- admitted_at + season.claim_hours
  waitlist_position int,
  rejection_reason text,                      -- internal only
  unique (user_id, season_id)
);
-- RLS: owner read own (minus rejection_reason), insert own. Admin: full.
--      Status transitions ONLY via RPC `advance_application()` (service role) —
--      never direct client updates.

create table season_members (
  id uuid primary key,
  user_id uuid not null references profiles(id),
  season_id uuid not null references seasons(id),
  stripe_payment_intent text not null,
  price_paid_cents int not null,
  joined_at timestamptz default now(),
  unique (user_id, season_id)
);
-- RLS: owner read own. Insert ONLY via Stripe webhook (service role). Admin: full.

-- ============ THE DROP ============

create table drops (
  id uuid primary key,
  season_id uuid not null references seasons(id),
  user_id uuid not null references profiles(id),
  drop_date date not null,
  released_at timestamptz,                    -- null until 8pm release
  unique (user_id, season_id, drop_date)
);

create table drop_cards (
  id uuid primary key,
  drop_id uuid not null references drops(id) on delete cascade,
  shown_profile_id uuid not null references profiles(id),
  is_encore boolean not null default false,
  action card_action not null default 'pending',
  acted_at timestamptz
);
-- RLS (both tables): owner read own drops WHERE released_at is not null.
--      Owner may update drop_cards.action pending→passed only.
--      (pending→connected happens via `send_connect()` RPC atomically.)
--      Insert: service role (cron) only. Admin: read all.
create index on drop_cards (drop_id);
create index on drop_cards (shown_profile_id);

-- ============ CONNECT (INBOX MODEL) ============

create table connects (
  id uuid primary key,
  season_id uuid not null references seasons(id),
  from_user uuid not null references profiles(id),
  to_user uuid not null references profiles(id),
  drop_card_id uuid not null references drop_cards(id),
  prompt_ref jsonb not null,                  -- {type:'prompt'|'photo', id}
  reply_text text,                            -- required if no reply_voice
  reply_voice_path text,                      -- required if no reply_text
  status connect_status not null default 'pending',
  responded_at timestamptz,
  unique (from_user, to_user, season_id)      -- one shot per person per season
);
-- RLS: from_user read own sent. to_user read incoming (this IS the inbox).
--      Insert via `send_connect()` RPC (validates card ownership + reply present).
--      Status update via `respond_connect()` RPC only.
--      CHECK: reply_text is not null OR reply_voice_path is not null.
create index on connects (to_user, status);

-- ============ CHAT + FUSE ============

create table chats (
  id uuid primary key,
  season_id uuid not null references seasons(id),
  connect_id uuid not null unique references connects(id),
  user_a uuid not null references profiles(id),
  user_b uuid not null references profiles(id),
  state chat_state not null default 'active',
  fuse_expires_at timestamptz not null,       -- accepted_at + season.fuse_days
  fuse_paused_at timestamptz,
  warned_48h boolean not null default false,
  warned_24h boolean not null default false,
  closed_at timestamptz
);
-- RLS: participants read own. State changes ONLY via RPCs / cron (service role).
create index on chats (state, fuse_expires_at);

create table messages (
  id uuid primary key,
  chat_id uuid not null references chats(id) on delete cascade,
  sender_id uuid,                             -- null = system message
  kind message_kind not null default 'text',
  body text,
  voice_path text,
  voice_duration_ms int,
  read_at timestamptz
);
-- RLS: participants of parent chat read; sender insert own WHERE chat.state
--      in ('active','date_scheduled','post_date_checkin'). No edits/deletes in v1.
--      Realtime enabled on this table (filtered by chat_id).
create index on messages (chat_id, created_at);

create table dates (
  id uuid primary key,
  chat_id uuid not null references chats(id),
  proposed_by uuid not null references profiles(id),
  status date_status not null default 'proposed',
  scheduled_for timestamptz not null,
  place_name text not null,
  place_note text,                            -- 'the one on Howell Mill'
  confirmed_at timestamptz
);
-- RLS: participants read; propose/respond via RPCs.
--      A CONFIRMED date is the ONLY thing that pauses a fuse.

create table date_checkins (
  id uuid primary key,
  date_id uuid not null references dates(id),
  user_id uuid not null references profiles(id),
  answer checkin_answer not null default 'no_response',
  answered_at timestamptz,
  unique (date_id, user_id)
);
-- RLS: owner read/answer own; partner NEVER sees the other's raw answer —
--      only the system outcome (chat continues or closes).

create table closure_notes (
  id uuid primary key,
  chat_id uuid not null references chats(id),
  from_user uuid,                             -- null = fuse auto-close (system)
  template_id text not null,                  -- 'closure_01'..'closure_06' | 'fuse_auto' | 'decline_auto'
  personal_line text,
  tone_check_passed boolean,
  delivered_at timestamptz
);
-- RLS: recipient + sender read after delivery. Insert via `close_chat()` RPC
--      (runs tone check on personal_line before commit; rejects on fail with
--      a rewrite suggestion — never silently strips).

-- ============ SAFETY, WAITLIST, NOTIFICATIONS, ADMIN ============

create table reports (
  id uuid primary key,
  reporter_id uuid not null references profiles(id),
  reported_id uuid not null references profiles(id),
  chat_id uuid references chats(id),
  reason text not null,
  detail text,
  resolved_by uuid,
  resolution text,                            -- 'dismissed'|'warned'|'removed'
  resolved_at timestamptz
);
-- RLS: reporter insert + read own. Admin: full. Reporting immediately
--      hides reporter from reported user's surfaces (drop exclusion).

create table waitlist (
  id uuid primary key,
  email text not null,
  phone e164 text,
  city text not null default 'Atlanta',
  season_interest uuid references seasons(id),
  position int,
  source text,                                -- utm / event code
  unique (email, city)
);
-- RLS: anon INSERT via rate-limited edge function only. Admin read.

create table notifications (
  id uuid primary key,
  user_id uuid not null references profiles(id),
  channel notif_channel not null,
  template text not null,                     -- key into §8 matrix
  payload jsonb not null default '{}',
  sent_at timestamptz,
  read_at timestamptz
);
-- RLS: owner read own in-app rows. Insert: service role.

create table notification_prefs (
  user_id uuid primary key references profiles(id),
  drop_push boolean default true,
  drop_sms boolean default false,
  fuse_warnings boolean default true,
  email_updates boolean default true
);
-- RLS: owner full on own row. Drop alert + fuse warnings ALWAYS have at least
--      one channel active (product-critical); UI enforces, not DB.

create table admin_audit (
  id uuid primary key,
  admin_id uuid not null,
  action text not null,
  target_table text,
  target_id uuid,
  detail jsonb
);
-- RLS: admin read. Every admin mutation writes here via RPC wrapper.
```

**Storage buckets:** `photos` (public-read via CDN after approval, path-scoped write to own folder), `voice-notes` (participant-scoped signed URLs, 24h expiry), `verification-selfies` (no client read ever; admin signed URLs only).

**Non-negotiable pattern:** every state transition (application status, connect response, chat close, date confirm) is a **Postgres RPC** (`security definer` function) that validates the transition, writes the audit trail, and enqueues notifications. Clients never mutate state columns directly. This is what makes "nobody can be ghosted" enforceable at the database layer, not the UI layer.

---

## 6. Core Mechanics — Rules & State Machines

All implemented as pure functions in `packages/logic` with unit tests. The cron jobs and RPCs are thin wrappers.

### 6.1 Drop algorithm (`buildDrop(userId, season, poolSnapshot): DropCard[]`)

**Eligibility pool** for user U = all active season members M where:
1. Mutual orientation match: M.gender ∈ U.seeking AND U.gender ∈ M.seeking
2. M has never appeared in U's drop cards (EXCEPT encore-eligible, below)
3. No connect exists between U and M in either direction (any status)
4. M.status = 'active' (paused / found_someone / removed excluded)
5. Neither has reported the other

**Scoring (v1 — deliberately simple, no ML):**
- +3 shared neighborhood cluster (in-town / OTP-north / OTP-south groupings)
- +2 age within each other's stated ranges (hard filter, not score — exclude if outside)
- +1 per overlapping interest tag (cap +3)
- +2 "activity balance": M has below-median incoming connects this week (spreads attention, prevents the top-decile pile-on that wrecks pool morale)
- Deterministic seeded shuffle as tiebreak (seed = userId + drop_date) so re-runs are idempotent

**Serve rules:**
- Serve top `min(3, eligible)` — **fewer is correct** as pool thins; never pad with weak matches
- If eligible = 0: serve the "quiet night" empty state (§9.6) — honest, on-brand
- **Encore drops (weeks 5–8):** profiles U passed in weeks 1–2 re-enter eligibility exactly once, flagged `is_encore = true`, max 1 encore per drop. Card carries the encore banner copy (§9.3).

**Reciprocity rule:** the algorithm never engineers mutual drops and never suppresses based on predicted rejection. Serving is need-blind of the other side's inbox except the activity-balance nudge above. (This is a brand promise — document it publicly in the FAQ.)

### 6.2 Connect flow (inbox model)

```
DropCard(pending)
  ├─ pass()            → action='passed'. Silent. They never know. Final.
  └─ send_connect()    → requires prompt_ref + (reply_text | reply_voice)
                         action='connected', Connect(pending) → lands in their Inbox
Connect(pending)
  ├─ accept()          → Chat created (state='active',
  │                      fuse_expires_at = now() + season.fuse_days)
  │                      The connect reply becomes message #1 in the chat.
  ├─ decline()         → status='declined', decline auto-note (§9.2) delivered
  │                      to sender as a system message. Kind. Final. No reply channel.
  └─ [season ends]     → status='expired', decline auto-note variant delivered.
```

- Connects pending > 72h trigger one gentle nudge to the recipient ("Someone wrote you a note — they deserve an answer either way"). Never shown to the sender.
- One connect per pair per season (DB-enforced). A decline is final — no re-sends.

### 6.3 Fuse state machine (per chat)

```
active ──(confirmed date)──────────► date_scheduled   [fuse PAUSED]
active ──(fuse_expires_at reached)─► closed_fuse      [auto closure note both ways]
active ──(user closes w/ note)─────► closed_by_user   [closure note delivered]

date_scheduled ──(date cancelled)──► active           [fuse RESUMES with
                                                       max(remaining, 48h) — a
                                                       cancellation never insta-kills]
date_scheduled ──(scheduled_for + 24h)─► post_date_checkin

post_date_checkin:
  both answer 'continue'      → active [FRESH 7-day fuse toward date #2]
  either answers 'close'      → closed_by_user [their chosen closure note sent;
                                the raw check-in answers are never revealed]
  no answer within 72h        → closed_fuse [auto closure note]

any state ──(mutual graduation)──► closed_graduated  ["Found Someone" flow]
any state ──(season ends_at)─────► closed_season_end [season-end note, soft]
```

**Warnings:** at T-48h and T-24h (once each, `warned_*` flags) via the user's chosen channel. Copy in §9.4 — the warnings are the product's heartbeat; they must feel like a coach, not a threat.

**What counts as a date:** a `dates` row with `status='confirmed'` (proposed by one, explicitly confirmed by the other, with a real `scheduled_for` and `place_name`). Nothing else pauses a fuse. No date-faking loophole: `scheduled_for` must be ≥ 2h and ≤ 14 days out.

### 6.4 Capacity (no hard cap — measured)

No slot limit in Season One. The fuse is the regulator: max realistic concurrent chats ≈ active connects sustainable within rolling 7-day windows. **Instrument it:** admin dashboard tracks concurrent-active-chats distribution (p50/p90/max) weekly. If p90 > 5 by week 3, that's the Season Two hard-cap trigger — decided by data, not vibes.

### 6.5 Graduation ("Found Someone" — minimal v1)

Either chat participant can propose graduation from an active chat → other confirms → both accounts set `found_someone`: all their other active chats close with the "met someone" template (closure_03), drops stop, and both get the exit survey (3 questions: how many dates, would you recommend, quote we can use). Declining a graduation proposal is allowed and private; chat simply continues. Alumni wall itself is Season Two — v1 just captures the data and celebrates in-app (confetti, ghost mascot waving goodbye).

### 6.6 Tone check (`toneCheck(personalLine): pass | {fail, suggestion}`)

Claude API call (claude-sonnet-4-6, temp 0) with a fixed rubric: reject cruelty, mockery, appearance-based reasons, or contact-info smuggling; allow honest, warm, plain reasons. On fail, return a kinder rewrite suggestion — the user chooses to edit or drop the personal line, never blocked from closing. Template-only closures skip the check entirely. Log pass/fail rates to admin (privacy: store boolean + category, never the rejected text).

---

## 7. Surface Specs

### 7.1 Marketing site — `apps/web (marketing)` — noghost.app

Pages: **Home**, **How It Works**, **FAQ**, **Apply** (`/apply`), **Terms/Privacy**, **Waitlist** (other cities / season full).

Home structure (copy in §9.1): Hero → The Problem (three lines, not a manifesto) → The Season model → The Drop → The Fuse → The Closure promise → Pricing (pass, both tiers, what's included) → Verification/safety strip → FAQ preview → Apply CTA with live seats-remaining counter (real number from DB, updates via Realtime — honest scarcity only).

Design system: run the LuxWeb Archetype Selection Gate (`.luxweb/ARCHETYPES.md`) at Phase 1 kickoff. Direction constraint for the gate: warm-human-editorial territory, anti-neon, anti-corporate; must hold the ghost mascot without going cartoon. Motion per MOTION.md; app surfaces per APP.md.

### 7.2 Member app — `apps/web (app)` + `apps/mobile` (feature-identical)

| Screen | Core elements |
|---|---|
| **Onboarding** | Phone OTP → name/birthdate/gender/seeking → neighborhood → age range prefs → interests (pick 5–10) → photos (3–6) → 3 prompts from library (§9.7) → optional 30s voice intro → selfie liveness → "application under review" state |
| **Pre-season home** | Countdown to `starts_at`, profile-completeness meter, TestFlight/PWA install prompts, "how the Drop works" primer cards |
| **Tonight (Drop)** | Pre-8pm: subtle countdown. Post-8pm: up to 3 full-profile cards (photos, prompts, voice intro player, neighborhood, age). Actions per card: **Pass** (quiet) / **Reply to connect** — tap a specific prompt or photo → compose text or record voice reply → send. Encore cards show encore banner. |
| **Inbox** | Incoming connects: their card + which prompt they replied to + the reply (text or voice). **Accept** → chat opens. **Decline** → confirm sheet explaining the kind auto-note ("They'll get a real answer, not silence"), then done. |
| **Chats** | List sorted by fuse urgency. Each row: name, last message, **fuse ring** (visual countdown — calm > 72h, amber < 48h, warm-red < 24h; never a panic timer). Date-scheduled chats show a calendar chip instead of the ring. |
| **Chat detail** | Messages (text + voice player), composer with hold-to-record, **"Propose a date"** button (always visible in header — the chat's entire purpose): picker for day/time + place name + note → sends as rich system card the other taps to Confirm / Suggest change. Post-date: check-in card when opened. **Close kindly**: template picker (§9.2) + optional personal line → tone check → delivered. |
| **Profile/Settings** | Edit photos/prompts/voice intro (identity fields locked), notification prefs, pause account, Found Someone, report/block (from any profile or chat), sign out, delete account (full cascade). |

Mobile specifics: Expo Router tabs (Tonight / Inbox / Chats / Profile), Expo AV for voice record+play, Expo Notifications, deep links `noghost://chat/[id]` from pushes, checkout opens system browser → Stripe → universal-link return.
Web specifics: installable PWA (manifest + service worker), Web Push opt-in flow immediately after pass claim (the moment motivation peaks), MediaRecorder voice notes with waveform scrub.

### 7.3 Admin — `apps/admin` — admin.noghost.app

Auth: Supabase email allow-list (`ADMIN_EMAILS` env) + password + TOTP. Every mutation → `admin_audit`.

| Module | Features |
|---|---|
| **Admissions** | Review queue: application + selfie vs profile photos side-by-side, liveness score, approve/reject (+reason). **Ratio dashboard**: seats claimed vs cap per matching segment (gender × seeking), imbalance warnings, waitlist promotion controls. Claim-window monitor. |
| **Season console** | Edit all `seasons` config, phase transitions (with confirm gates), season calendar, seats-remaining override for marketing site. |
| **Cohort health** | Daily: drops served, connect rate, accept rate, active chats (p50/p90/max concurrent), dates proposed/confirmed/completed, fuse closes vs user closes vs graduations, DAU. Charts + CSV export. **This screen is the Season Two design input.** |
| **Moderation** | Reports queue (chat context view), tone-check fail rates, warn/remove member (removal closes their chats with a neutral system note to partners — even removal doesn't ghost anyone), photo re-review. |
| **Comms** | Broadcast announcement to cohort (in-app + optional email), template preview/test-send for every notification in §8. |
| **Money** | Stripe payment list (linked), refund trigger (service-role RPC + audit), early-bird counter. |

### 7.4 Auth model

Supabase phone OTP is the primary credential (it doubles as verification layer 1). Email captured at application for receipts/comms. Admin is email+password+TOTP, separate allow-list. Sessions: standard Supabase JWT; mobile uses SecureStore.

---

## 8. Notifications Matrix

| Template key | Trigger | Channels (default) | Copy ref |
|---|---|---|---|
| `application_received` | Application submitted | email | §9.5.1 |
| `admitted_claim` | Admin approves | email + SMS | §9.5.2 |
| `claim_reminder` | Claim deadline −24h | SMS | §9.5.3 |
| `season_start` | `starts_at` morning | push + email | §9.5.4 |
| `drop_live` | 8:00 PM release | push (SMS opt-in) | §9.4.1 |
| `connect_received` | Connect lands in inbox | push | §9.4.2 |
| `connect_accepted` | They accepted your connect | push | §9.4.3 |
| `connect_declined` | Decline auto-note | in-app system msg | §9.2.7 |
| `fuse_48h` / `fuse_24h` | Fuse sweep | push (SMS opt-in) | §9.4.4/5 |
| `chat_closed_fuse` | Auto-close | push + in-app | §9.4.6 |
| `closure_received` | Closure note delivered | push + in-app | §9.4.7 |
| `date_proposed` / `date_confirmed` | Date RPCs | push | §9.4.8/9 |
| `checkin_open` | Date +24h | push | §9.4.10 |
| `connect_nudge` | Connect pending 72h | push | §9.4.11 |
| `season_finale` | Final week + finale event | push + email | §9.5.5 |

Quiet hours: nothing sends 11 PM–9 AM except `drop_live` never applies (8 PM) — fuse sweeps queue morning delivery.

---

## 9. Copy Library (verbatim — no placeholders, no rewrites without owner sign-off)

### 9.1 Marketing site copy

**Hero:**
> **Dating with a start date.**
> NoGhost runs in 8-week seasons. Everyone starts together. Up to three people a night, chosen for you. Every conversation ends in a real date or a kind goodbye — never silence.
> [Apply for Atlanta Season One] · Applications close {{APPS_CLOSE_DATE}} · {{SEATS_REMAINING}} of 300 seats left

**The Problem (three lines):**
> The apps gave us infinite options and called it abundance.
> What we got was burnout, dead chats, and people who vanish.
> We built the opposite.

**The Season:**
> **One city. 300 people. Eight weeks.**
> A season has a start date, an end date, and a finale party. Everyone begins on day one — no stale profiles, no dead accounts, no wondering if anyone's actually here. When it ends, it ends. Then the next one begins.

**The Drop:**
> **8:00 PM. Up to three people. That's the whole feed.**
> No swiping, no scrolling, no wall of faces. Each night we introduce you to up to three people chosen for you. Read them properly — to say hello, you have to reply to something specific about them. There is no "like" button on NoGhost.

**The Fuse:**
> **Every chat has seven days to become a real date.**
> Put a time and place on the calendar and the clock stops. Don't, and the chat closes on its own — with a kind note, both ways. NoGhost isn't a texting app. It's how you meet.

**The Closure promise:**
> **Nobody gets ghosted here. Nobody.**
> Every ending on NoGhost comes with words. Decline someone — they get a kind note. A chat runs out of road — a kind note. It's not always a yes. It's always an answer.

**Pricing:**
> **One pass. One season. That's the business model.**
> $40 early bird (first 100 admitted) · $50 standard. Applying is free — you only pay if you're admitted. No subscription, no premium tier, no paying to be seen. We make money when you show up, not when you stay single.

**Verification strip:**
> Every member is phone-verified, selfie-verified, and approved by a human before day one. Yes, a person looks at every application. That's the point.

**FAQ (full answers on page):**
1. Why do I have to apply? — Because 300 verified, ready people beat 30,000 maybes. Admissions is how we keep the ratio balanced and the bots at zero.
2. What if I don't get admitted this season? — You're first in line for Season Two, no re-application needed.
3. What happens when the season ends? — The app goes quiet until next season. Ongoing chats get each other's contact info option before close. Real connections leave the app — that's success, not churn.
4. Can I pay for more drops or more time? — No. Nobody can. That's a promise, not a tier we haven't built yet.
5. Is my selfie verification stored? — It's used for approval, visible only to our review team, and deletable on request. Never shown to other members.
6. Does the algorithm hide me if people pass on me? — No. We don't rank you by desirability and we never suppress profiles. The one nudge we make: spreading attention so the same ten people don't get every connect. Everyone gets seen.

### 9.2 Closure note templates (member-selectable)

- **closure_01 — "Not the right match":** "I've really enjoyed talking, but I don't think we're the right match. I wanted to tell you instead of disappearing. Genuinely — good luck out there."
- **closure_02 — "No spark":** "You seem great, and I mean that. I'm just not feeling the connection I'm looking for. Thank you for the real conversation."
- **closure_03 — "Met someone":** "I've connected with someone else this season and want to give that my full attention — you deserve someone who can. Thanks for the great conversation."
- **closure_04 — "Another life":** "I think we might be a maybe-in-another-life. No hard feelings on my end — I hope none on yours."
- **closure_05 — "Being honest early":** "I'd rather be honest now than distant later: I don't see this going where we both want. I respected you enough to say so."
- **closure_06 — "Stepping back":** "I'm stepping back from this conversation, but I didn't want silence to do the talking. Wishing you a good rest of the season."
- **fuse_auto (system):** "This chat reached the end of its seven days without a date on the calendar, so NoGhost closed it for you both — no fault, no silence. Your next drop is at 8."
- **decline_auto (connect declined):** "{{FIRST_NAME}} read your note and isn't able to connect this season. That's a real answer, not a maybe — which means you can spend your energy where it counts. See you at tonight's drop."
- **removal (system, to partners of a removed member):** "This conversation was closed by NoGhost and won't continue. It's nothing you did. Your next drop is at 8."
- **season_end (system):** "{{SEASON_NAME}} has ended — and this conversation doesn't have to. If you'd both like to keep talking, share contact info below before the app goes quiet. Either way: thank you for ending things the NoGhost way all season. 👻"

### 9.3 Drop & encore copy

- Pre-8pm state: "Tonight's drop lands at 8:00." (countdown, ghost mascot idle animation)
- Drop header: "Tonight, {{FIRST_NAME}}." / sub: "{{N}} people, chosen for you. Take your time — they're not going anywhere for 24 hours."
- Encore banner: "**Encore.** You passed on {{FIRST_NAME}} in week {{WEEK}}. Six weeks of this season later, people read differently. One more look — no pressure."
- Connect composer helper: "Reply to something specific. It's the only way to say hello here."

### 9.4 Notification copy (push unless noted)

1. `drop_live`: "Tonight's drop is live. 👻" / SMS: "NoGhost: tonight's drop is live. {{APP_URL}}"
2. `connect_received`: "Someone replied to your prompt about {{PROMPT_TOPIC}}."
3. `connect_accepted`: "{{FIRST_NAME}} said yes. Your seven days start now."
4. `fuse_48h`: "48 hours left with {{FIRST_NAME}}. Put a date on the calendar or part ways kindly — those are the options."
5. `fuse_24h`: "Last day with {{FIRST_NAME}}. One tap to propose a time and place."
6. `chat_closed_fuse`: "Your chat with {{FIRST_NAME}} closed at the seven-day mark. No silence — there's a note waiting."
7. `closure_received`: "{{FIRST_NAME}} left you a closing note. It's kind — they all are here."
8. `date_proposed`: "{{FIRST_NAME}} proposed {{DAY}} at {{PLACE}}. Confirm or counter."
9. `date_confirmed`: "It's on: {{DAY}}, {{PLACE}}. The clock's paused — go be people."
10. `checkin_open`: "How was {{PLACE}} with {{FIRST_NAME}}? Continue or close — your answer stays private."
11. `connect_nudge`: "Someone wrote you a note two days ago. They deserve an answer either way — that's the whole idea."

### 9.5 Email/SMS lifecycle (Resend templates; subjects shown)

1. `application_received` — Subj: "Application received — Atlanta Season One". Body: what happens next (verification review, decision within 5 days), no payment yet, reply-to is a human.
2. `admitted_claim` — Subj: "You're in. Claim your seat in Atlanta Season One." Body: congrats, pass price ({{PRICE}} — early bird if within first 100), **72-hour claim deadline {{CLAIM_DEADLINE}}**, what the pass includes (full season, finale event, zero upsells), Stripe checkout link. SMS: "NoGhost: you're admitted to Atlanta Season One. Claim your seat within 72h: {{LINK}}"
3. `claim_reminder` — SMS only: "24h left to claim your NoGhost seat. After that it goes to the waitlist: {{LINK}}"
4. `season_start` — Subj: "Day one. 👻" Body: tonight's first drop at 8 PM, ground rules recap (drop / fuse / closure), finale date on the calendar, code of conduct one-liner.
5. `season_finale` — Subj: "Final week of Atlanta Season One." Body: finale event details, what happens to open chats at season end, exit survey ask, Season Two priority note.

### 9.6 Empty states

- Inbox empty: "No notes yet. Tonight's drop is another three chances." 
- Chats empty: "Chats live here — every one of them on a seven-day clock. Accept a connect to start one."
- Quiet night (0 eligible to drop): "A quiet night. We won't pad your drop with weak matches — that's a promise, not a bug. Tomorrow at 8."
- Post-season: "{{SEASON_NAME}} is a wrap. {{DATES_COUNT}} real dates happened. Season Two applications open {{S2_DATE}} — you're already on the list."

### 9.7 Prompt library (members answer exactly 3)

1. "The most Atlanta thing about me is…"
2. "A perfect first date ends with…"
3. "I'll talk your ear off about…"
4. "The green flag I bring is…"
5. "My friends would warn you that…"
6. "Something I changed my mind about recently…"
7. "You should pass on me if…"
8. "The last thing that made me laugh out loud…"
9. "I feel most myself when…"
10. "Ask me about the time I…"
11. "My unpopular food opinion is…"
12. "In eight weeks, I'm hoping for…"

### 9.8 Legal/consent strings

- Application checkbox: "I'm 21+, I live in metro Atlanta, and I agree to the NoGhost Terms, Privacy Policy, and Community Standards." (21+ is a Season One curation choice, not a legal minimum — revisit for S2.)
- Selfie consent: "Your selfie is used only to verify you're you. Review-team eyes only, never shown to members, deleted on request."
- SMS opt-in (TCPA): explicit checkbox at claim, STOP handling via Twilio, language: "Season alerts only. Never marketing. Reply STOP anytime."

---

## 10. Build Phases (Claude Code execution order)

Each phase ends with: typecheck clean, unit tests green (`packages/logic` is test-first), deploy to preview, owner review gate. Update root README.md per phase.

- **Phase 0 — Foundation (repo + data):** Turborepo scaffold (pnpm), all packages stubbed, new Supabase project, full §5 schema as migrations + RPCs + RLS + storage buckets, seed script (1 season + 40 fake profiles from generator — clearly marked, admin-purgeable), typed DB package, env schema (zod) for all three apps.
- **Phase 1 — Marketing + application funnel:** Run LuxWeb Archetype Gate → tokens into `ui-tokens`. Marketing site all pages + copy §9.1. Application flow: phone OTP → profile builder → selfie capture → under-review state. Live seats counter.
- **Phase 2 — Admissions + money:** Admin app shell + auth (allow-list + TOTP). Admissions queue + ratio dashboard. `advance_application` RPC chain. Stripe products + checkout + webhook → `season_members`. Claim window + `claim-sweep` cron + waitlist promotion. Lifecycle emails/SMS 9.5.1–3.
- **Phase 3 — The Drop + Connect:** `buildDrop` in `packages/logic` (unit-tested against pool-math fixtures: thin pools, orientation asymmetry, encore windows). Drop crons. Tonight screen (web). Connect composer (text first) + Inbox + accept/decline RPCs + decline auto-note. 
- **Phase 4 — Chat + Fuse + Dates:** Realtime chat, fuse state machine + `fuse-sweep`, warnings, closure flow (templates + personal line + tone check), date propose/confirm/cancel, check-in flow, Found Someone graduation. Voice notes (web MediaRecorder) for messages + connect replies + profile intro.
- **Phase 5 — Notifications + PWA:** Full §8 matrix, web push, PWA manifest/SW/install flow, notification prefs, quiet hours.
- **Phase 6 — Mobile (Expo):** Tabs + all member screens consuming the same `logic`/`db` packages. Expo AV voice, Expo push, deep links, browser checkout round-trip. EAS build profiles. **Gate: TestFlight build submitted no later than S-28 days.**
- **Phase 7 — Ops hardening + launch:** Cohort health dashboard, moderation + reports, broadcasts, refunds, audit review. Load-check drop release (300 concurrent at 8 PM). Rate limits (OTP, connects, waitlist). Full-season simulation run on seed data (time-travel test: 56 days in fast-forward, assert zero silent endings possible). App Store + Play submissions at S-28.

**Explicit cut order if timeline slips:** voice intro on profile → waveform scrub (plain player) → encore drops (S1.5 patch) → voice notes entirely. The fuse, closure notes, and decline auto-notes are never cut — they are the product.

---

## 11. Launch Ops Timeline (relative to Season Start = S)

| When | Milestone |
|---|---|
| S−70 | Domain + Stripe + Supabase + Twilio/Resend live. Applications open. Outreach begins (events, run clubs, partner communities). |
| S−28 | **App Store / Play submission deadline.** TestFlight opens to early-bird claimants ("founding member" beta framing = free QA). |
| S−21 | Admissions reviews rolling weekly; ratio monitored per segment — admit to balance, waitlist the surplus side regardless of demand. |
| S−7 | Cohort locked at ≤300. Season-start email. Finale venue booked. Web fallback drill (if mobile still in review, launch is web+PWA — announced as such, not apologized for). |
| S | Day one. First drop 8:00 PM. Kevin watches the cohort-health dashboard live. |
| S+14 | Week-2 checkpoint: connect rate, fuse-close ratio, concurrent-chat p90 → tune drop scoring weights only (never mechanics mid-season). |
| S+35 | Encore drops begin (week 5). Season Two waitlist page live, fed by press/word-of-mouth. |
| S+56 | Finale event. Season closes. Exit surveys. S2 pricing announced to alumni first. |

---

## 12. Out of Scope — Season Two / Three Ledger

**S2:** Lock ceremony + alumni wall · hard slot cap (only if p90 data triggers) · squad first-dates in-app (Timeleft-style, automate what concierge proved) · Stripe Identity badge · second city scouting · 18–20 age tier decision.
**S3:** Advisors/board-of-directors (second user role + invite graph = the viral loop) · multi-city season calendar · native IAP evaluation (only if Apple economics change).
**Never:** paid visibility, paid extra drops, paid fuse extensions, engagement-bait notifications, desirability ranking.

---

## 13. Claude Code Kickoff Prompt

> You are building **NoGhost**, a season-based dating platform, from the spec at `noghost-season-one-spec.md`. Read the entire spec before writing any code. Then read `.luxweb/WORKFLOW.md`, `STACK.md`, `APP.md`, `MOTION.md`, and run the Archetype Selection Gate from `ARCHETYPES.md` before any UI work (direction constraint: warm-human-editorial, anti-neon, must carry a minimal line-art ghost mascot).
>
> Non-negotiables: (1) All mechanics — drop algorithm, fuse state machine, tone check, eligibility — are pure, unit-tested functions in `packages/logic`; UI and cron are thin callers. (2) Every state transition is a Postgres RPC with RLS; clients never mutate state columns. (3) All copy comes verbatim from §9 — never write placeholder or improvised user-facing text; if a string is missing, stop and ask. (4) Follow the §10 phase order exactly; stop at each phase gate for review. (5) `APP_NAME` and all brand strings from `packages/config` only.
>
> Begin with Phase 0. Confirm the Supabase project is the NEW dedicated project before running any migration.

---
*Spec v1.0 — generated from locked discovery. Changes require a version bump and a decision-log entry in §2.*
