# NoGhost

Dating in seasons. Everyone starts together. Nobody gets ghosted.

An eight-week, one-city dating season. Up to three curated profiles land at
8:00 PM daily. Every conversation carries a seven-day fuse: put a real date on
the calendar or the chat closes itself with a kind note. Nobody on NoGhost can
be ghosted — mechanically.

Built from [`noghost-season-one-spec.md`](./noghost-season-one-spec.md).
Design direction from [`luxweb-master/`](./luxweb-master).

---

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Monorepo, season mechanics, database schema | ✅ Complete |
| 1 | Marketing site | ✅ Complete |
| 1 | Application funnel (phone OTP → profile → selfie) | ✅ Complete · wired to Supabase |
| 1 | Live database — schema, RLS, storage, write path | ✅ Verified against the real project |
| 2 | Admin console — auth + TOTP, admissions queue, ratio dashboard | ✅ Verified against the real project |
| 2 | `claim-sweep` cron — expiry, waitlist promotion, reminders | ✅ Verified against the real project |
| 2 | Audit trail view — §7.3's other half | ✅ Verified against the real project |
| 2 | Stripe checkout + webhook | ⬜ Blocked on a Stripe account |
| 3 | `generate-drops` / `release-drops` crons | ✅ Verified against the real project |
| 3 | Tonight — the Drop, pass, connect composer | ✅ Verified against the real project |
| 3 | Inbox — accept / decline a connect | ✅ Decline verified live · accept needs `0011` |
| 4 | `fuse-sweep` cron — warnings, expiry, closure notes | ✅ Verified against the real project |
| 4 | Chats — fuse rings, dates, closing kindly | ✅ Verified against the real project |
| 4 | `checkin-sweep` + post-date check-in | ✅ Verified against the real project |
| 4 | Found Someone (graduation) + voice notes | ⬜ |
| 5 | Notifications + PWA | ⬜ |
| 6 | Mobile (Expo) | ⬜ |
| 7 | Ops hardening + launch | ⬜ |

**Two migrations are waiting to be applied by hand.** `0010_admin_table_grants.sql`
is insurance — nothing breaks until Supabase drops its default table privileges.
`0011_enum_assignment_casts.sql` is not: without it, **accepting a connect
fails**, and so does pausing an account. See "A bug two RPCs shipped with" below.

**One thing is not yet driveable end to end:** phone auth is disabled on the
Supabase project, so the OTP step fails closed. Everything on either side of it
— the OTP send, the storage uploads, the profile/verification/application
writes and the `advance_application` chain to `under_review` — is verified
against the live database by `pnpm db:verify:writes`.

**Layouts (locked):** funnel — Asymmetric Editorial + stepped form. Member app
— Focus Mode, Split Canvas for Inbox/Chats. Admin — Split Canvas + dense
sections. Reasoning in [`docs/design-decisions.md`](./docs/design-decisions.md).

**Design direction (locked):** Editorial Refined → Warm Serif Magazine.
Fraunces + DM Sans. Cream `#FAF7F2` / ink `#1A1815` / ochre `#B8741A` /
sage `#8B9D83`. VARIANCE 4 · MOTION 4 · DENSITY 3 · LIGHT.

---

## Quickstart

```bash
pnpm install
cp .env.example apps/web/.env.local     # NEXT_PUBLIC_USE_SEED_DATA=true works with no services
pnpm dev
```

The app runs entirely on local seed fixtures until Supabase is provisioned.
Flipping `NEXT_PUBLIC_USE_SEED_DATA` to `false` is the only change needed to
point it at the real database.

```bash
pnpm test        # 171 tests, all in packages/logic
pnpm typecheck
pnpm build
pnpm db:seed     # regenerate supabase/seed.sql from the generator
```

---

## Against a real Supabase project

Apply `supabase/migrations/*.sql` in order, then:

```bash
pnpm db:seed:remote                 # one season + 40 profiles, over the API
pnpm db:seed:remote --applications  # …plus 12 applications with media, sitting at under_review
pnpm db:seed:remote --members       # …plus a season_members row each
pnpm db:seed:remote --live          # …and backdate day one so the drop crons actually run
pnpm db:seed:remote --chats         # …plus one chat at each position on the fuse
pnpm db:seed:remote --purge         # remove exactly those rows and their storage objects
pnpm db:verify                      # did the migrations apply, and does anon get denied?
pnpm db:verify:writes               # sign in as a member; do the writes work, and do the boundaries hold?
pnpm db:verify:fuse                 # does fuse-sweep warn, close, and write the note? (needs --chats + a dev server)

pnpm admin:grant you@example.com               # create or promote an admin (prints a password once)
pnpm admin:grant you@example.com --reset-mfa   # lost authenticator — forces re-enrolment
pnpm admin:grant you@example.com --revoke      # deactivate, keeping their audit history
```

`db:seed:remote` exists because `supabase/seed.sql` writes into `auth.users`,
which only the SQL editor or a direct connection can reach. Both read the same
generator, so they cannot drift.

`--members` exists because membership is normally written by the Stripe
webhook, so until that account exists there is no way to get a single member
into a season — and the drop algorithm, the fuse and everything downstream of
them have nobody to run against. The fixture rows carry an obviously-fake
`pi_deadbeef_…` payment intent. It also uploads three photos per profile: the
drop is a photo-forward surface, and a cohort with empty `photos` arrays renders
every card as "no photos on this profile" — a real state, but not the one worth
testing.

**`--live` changes what the marketing site says.** It backdates day one so the
season is mid-flight, which is the only way to exercise `generate-drops` before
October, and seeded members come off the public seat counter (300 → 260).
Re-running `pnpm db:seed:remote` with no flags restores the shipped fixture;
`--purge` removes the members too.

The two verify scripts answer different questions, and the second is the one
that matters. `db:verify` proves the objects exist. `db:verify:writes` signs in
as a real member and checks that each thing the funnel does succeeds **and**
that its inverse fails — uploading into someone else's photo folder, reading
back your own verification selfie, advancing your own application to
`admitted`. A policy that permits everything passes a structural check
perfectly.

For `admin_users` and `admin_audit` it goes one step further and insists on
*reachable but empty*. "The member saw no rows" is also what a missing GRANT
looks like (42501), and that distinction matters: `adminGate()` decides who is
an admin by reading its own `admin_users` row, so losing the grant locks every
admin out of the console while the console reports it as a permissions decision.
`0010_admin_table_grants.sql` makes those two grants explicit rather than leaving
them on Supabase's stock default privileges.

### The admin console

`apps/admin` runs on port 3001. Sign-in is email + password + TOTP, and TOTP is
**forced** — an admin session reads every member's date of birth, phone number
and verification selfie, so a password alone isn't a proportionate guard. The
allow-list is the `admin_users` table rather than the `ADMIN_EMAILS` env var
§7.3 specifies, because `is_admin()` is SQL and Postgres cannot read the app's
environment.

Admissions decisions call `advance_application` with the *admin's own session*,
not the service role. That is what puts the reviewer's id in `admin_audit` —
called as the service role there is no `auth.uid()`, and every decision lands in
the trail credited to the zero uuid. Migration `0009_admin_rpc_attribution.sql`
is what makes that possible; without it the console refuses decisions and says
so.

### The audit trail

`/audit` reads `admin_audit` back. §7.3 asks for two things — every mutation
audited, and the trail legible — and until this view only the first existed. A
record nobody can read holds nobody accountable.

Four decisions in it are load-bearing:

- **Times render in the season's timezone, not the server's.** Server-rendered,
  `toLocaleString` with no zone uses the host's — UTC on Vercel — so a decision
  made at 2pm reads as 7pm to the person who made it. The zone is explicit and
  labelled in the header.
- **`advance_application` gets a label per outcome.** One RPC covers a
  reviewer's decision *and* the applicant walking their own funnel
  (`applied → phone_verified → …`). A single label would call a form submission
  an admissions decision, and most rows are the funnel.
- **Paging is keyset on `(created_at, id)`, not `created_at` alone.** `audit()`
  stamps rows with `now()` — transaction start time — so any future function
  auditing several rows in one transaction produces entries sharing a timestamp
  to the microsecond, and a cursor on the timestamp alone silently skips or
  repeats the rest of that group. No caller does that today; the guard costs one
  `or` clause.
- **A target that no longer exists is shown, unlinked, as `deleted`.** The trail
  is append-only and outlives its rows — a member exercising deletion, or
  `db:verify:writes` cleaning up after itself. The entry is still valid; there is
  just nothing to open.

The cursor is opaque and both halves are pattern-checked before use, because
they are interpolated into a raw PostgREST `or=` expression. Verified against
the live project: seven malformed and hostile query strings all fall back to
page one, and a valid cursor still pages.

### Tonight — the member-facing Drop

`/tonight` in the `(app)` group, behind `requireMember()`. Four screens, and none
of them is an error: no season, built-but-not-landed, quiet night, and the drop
itself.

**Focus Mode**: one profile fills the view, lead photo → their prompts → the
remaining photos two-up. Three full-bleed photos in a row was the first attempt
and it pushed the writing 2,400px down the page — you scrolled a photo feed to
reach the words, which is the swiping mindset the layout decision exists to
avoid, rebuilt vertically.

**The card in focus is tracked by id, not by index.** `generate-drops` writes a
member's three cards in one batch, so they share a `created_at` to the
microsecond, and ordering on that column alone is not stable — Postgres returns
any order, and it *changes* once a row is updated, because an UPDATE rewrites the
tuple and moves it in the heap. The symptom was ugly and real: pass on someone,
and a different person slid into the slot you were reading. `lib/drop.ts` now
sorts on `(created_at, id)`; tracking by id means an ordering change can never
swap who is on screen again. Same lesson as the audit trail's keyset cursor.

The card's ranking is *not* preserved — the score lives in `buildDrop`'s return
value, not in a column. §6.1 specifies which three people are served, not the
order they are read in, so a stable order is the requirement; strongest-first
would need a `rank` column.

A pass is a direct UPDATE, allowed by exactly one RLS policy pinning the
transition to `pending → passed` on a released drop you own. It is the only
column a client may write. A connect goes through `send_connect()` instead,
because the connect row and the card flip have to land in one transaction.

Member sign-in is at `/sign-in`, in its own `(auth)` group — under the member
layout it would redirect to itself forever. It uses `shouldCreateUser: false`
and answers identically whether or not the number belongs to a member: a page
that said "no account for that number" would be a membership lookup for a dating
product that anyone could run.

### The inbox

`/inbox` is Split Canvas — list beside detail on desktop, list-only on mobile.
Two halves, and the second one is not decoration: incoming notes are what §7.2
describes, but a *declined* connect writes `connect_declined` as an `inapp`
notification that §8 marks `required: true`. An inbox showing only arrivals
would leave the one message the product exists to deliver with nowhere to land.
"Nobody gets ghosted" includes you, so "Your notes" is where the answer to
something you sent appears, printed verbatim from §9.2's `decline_auto`.

Accept goes straight through; decline gets the confirm sheet §7.2 specifies, and
that sheet reassures rather than warns. What people hesitate over is whether
saying no makes them the villain, so it says what actually happens: a real
answer, written kindly, and no reply channel to argue in. Backing out of it
writes nothing — verified.

`prompt_ref` always names something on the profile that appeared *on the card*,
which is the recipient's. So on a note you received it refers to something of
*yours*, and the first version looked it up in the sender's profile — printing
the question with no answer underneath, which is the one thing that screen is
for. Each side now reads from the right profile.

### A bug two RPCs shipped with

`case when … then 'voice' else 'text' end` has type `text`, not `message_kind`.
A bare `'voice'` literal in the same position works, because Postgres resolves an
unknown-type literal to the target column's type — but as branches of a CASE the
result resolves to `text` first, and there is no cast from text to an enum.

Two functions carried it, both load-bearing:

- **`respond_connect`** — accepting a connect creates the chat, then seeds
  message #1 from the sender's reply. That insert failed, so the whole
  transaction rolled back. **Nobody could ever accept a connect.**
- **`set_account_paused`** — same shape, on `profiles.status`. Pausing your own
  account never worked either.

`0011_enum_assignment_casts.sql` fixes both. Neither was reachable from a UI
until the inbox existed, and `pnpm db:verify` could not have caught them: it
proves each function *exists* by calling it with deliberate junk and accepting
any error that is not `PGRST202` — and a broken body produces an error too.
`pnpm db:verify:writes` now pauses and unpauses a real member, which catches the
class by executing it rather than by naming it.

Until 0011 is applied the inbox says so by name, rather than "that didn't save".

### Chats

`/chats` is Split Canvas, **sorted by fuse urgency rather than recency**. A
conversation with nineteen hours left needs attention more than one somebody
messaged five minutes ago; sorting by recency would make the app reward whoever
typed last, which is the opposite of what the fuse is for.

The **fuse ring** draws hours, not seconds. It does not tick, pulse, or animate —
§3.3 bans manufactured urgency, and a real deadline needs no theatre. A
`date_scheduled` chat shows a calendar chip instead: the fuse is paused, so a
ring showing time left would be a lie. The ring carries an `aria-label` in
hours, because a shrinking arc says nothing to a screen reader.

**"Propose a date" lives in the header and stays visible** while the chat is
open — §7.2 calls it the conversation's entire purpose. §6.3's window (at least
2 hours out, at most 14 days) is the anti-loophole rule, and it is checked three
times: the picker's `min`/`max`, `validateDateProposal`, and `propose_date` in
SQL. Only the person who did *not* propose can confirm — self-confirming would
let one member pause a fuse unilaterally, and the RPC refuses it.

**Closing kindly** sits at the end of the thread, not in the sticky footer. Six
templates, verbatim from §9.2, so nobody has to compose an ending from nothing
at 1am. A personal line is optional and goes through the tone check.

### The tone check

§6.6's rubric, at temperature 0, and it **offers** rather than refuses: a failed
line comes back as a kinder rewrite with the original still in the box and a
"send it as I wrote it" button beside it. The product's opinion about kindness is
a suggestion; the member's own words win. On an outage, a missing API key, or an
unparseable reply, the line passes — an ending must never be stuck behind an API.

Three details are load-bearing:

- **`temperature: 0` and `claude-sonnet-4-6` are only valid together.**
  `temperature` is rejected with a 400 on Opus 4.7 and later and on Sonnet 5, so
  changing the model means deleting the temperature line in the same commit.
- **Forced tool use, not `output_config.format`.** Structured outputs start at
  the Opus 4.8 / Sonnet 5 tier, so the schema rides as a tool's `input_schema`
  and the tool is forced. `parseToneCheckResponse` still validates the reply.
- **The rejected text is never stored.** §6.6: a boolean and a category, nothing
  else. `closure_notes.tone_check_passed` is `null` when the model half did not
  run — which is why the column is nullable rather than defaulting to `true`.

### The post-date check-in

`checkin-sweep` (§4.3) opens a check-in once a confirmed date's time plus 24
hours has passed. That is its whole job — the 72-hour timeout on an *unanswered*
check-in belongs to `fuse-sweep`, because that is a `tick` on an already-open
one. The split follows the data: a check-in is opened from a `dates` row and
closed from the chat's own clock, so merging them would mean one endpoint that
has to load two different worlds before it can decide anything.

It routes the transition through `fuseTransition`'s `date_elapsed` event rather
than writing the state by hand, which keeps the season-end rule ahead of it: a
date whose check-in comes due after `ends_at` closes the chat instead of opening
one nobody can answer.

**The privacy rule shapes every word on the card.** §5's note on
`date_checkins` is that "a participant never sees the other side's raw answer",
and the policy on that table is the tightest in the schema — `auth.uid() =
user_id`, own row only. So:

- `ChatDetail.checkin` has a field for *your* answer and deliberately none for
  theirs. Not withheld by application code; unreadable by it.
- The card never says "waiting on them" or "they said continue" — both leak the
  answer by implication. It reflects your own answer back and states the two
  possible outcomes.
- `answerCheckin` discards the RPC's return value. `answer_checkin` returns
  `closed` / `continued` / `pending`, and surfacing that would tell whoever
  answered first exactly what the second person chose.
- Either person choosing to close is enough, and that is said plainly rather
  than hidden — somebody deciding not to continue should not have to wonder
  whether their answer will be overruled, or whether the other person will be
  told it was theirs.

Both saying yes returns the chat to `active` with a fresh seven days, the pause
cleared and the 48/24-hour warnings rearmed for the new window.

### The fuse

`fuse-sweep` (§4.3) runs hourly and is the job that makes "nobody can be
ghosted" mechanical rather than aspirational: warn at 48 hours, warn at 24, and
the moment seven days are up close the chat and write the note. The state
machine is `fuseTransition` in `packages/logic` — pure, 27 unit tests, plus a
56-day simulation asserting no chat can reach a closed state without a note
being delivered. The route is the thin wrapper §6.3 describes: load, tick,
persist.

A closure becomes **three** things, and all three matter:

1. a row in `closure_notes` — §5 calls that table "the product promise"
2. a `system` message *inside* the conversation
3. the push to both people

Miss the second and the notification points at an empty chat, which is a promise
kept on paper only.

It loads open chats first and then their seasons, not the other way round.
Filtering by season phase would strand every chat the moment a season flipped to
`closed` — they would never be swept, so they would never get the `season_end`
note the state machine produces for exactly that case, and a chat left open
forever is the one outcome this product cannot ship.

Each state update is guarded by the state it was read in
(`.eq("id", …).eq("state", …)`), so two overlapping sweeps cannot both close the
same chat and nobody gets two notes about one ending.

`pnpm db:verify:fuse` drives the real endpoint against the real database, one
seeded chat per branch. It asserts the eight outcomes, that warnings go to both
sides exactly once, that a second sweep changes nothing, and that a season
ending closes even the chat with a date on the calendar. Each fixture chat
carries its intended outcome in its opening message, so the assertions read from
the fixture rather than from a number typed twice.

`--chats` writes those chats directly rather than through `respond_connect`,
for two reasons: that RPC is broken until 0011, and a chat 20 hours from expiry
is not a state you can reach by clicking — you would wait six days.

### Scheduled jobs

`claim-sweep` (§4.3) runs hourly, declared in `apps/web/vercel.json`. It expires
lapsed claim windows, promotes from the waitlist into the seats those release —
in the same pass, so a seat is never idle for an hour — and texts anyone inside
their last 12 hours **once**. That dedupe matters: the job runs hourly against a
12-hour horizon, and `claim_reminder` is `required: true` in §8's matrix, so it
is precisely the message a member cannot mute.

`generate-drops` (23:30 UTC) and `release-drops` (00:00 **and** 01:00 UTC) are
the two halves of §6.1. The first scores every active member against the pool
and writes their cards with `released_at` null; the second flips them visible
and queues the notifications. Splitting them means a slow build eats its own
half-hour of slack instead of pushing 8:00 PM back for everybody.

Three things in there are not obvious:

- **`release-drops` is scheduled twice and refuses one of the firings.** A
  Vercel cron is UTC with no zone, so `0 0 * * *` is 8:00 PM in New York in
  July and 7:00 PM in December — and "profiles land at 8:00 PM" is the
  product's one scheduling promise. Both candidate hours fire; `isReleaseDue`
  compares against the season's own local clock and drops the early one.
- **A member who already has tonight's drop is skipped, never rebuilt.** The
  pool shifts through the evening, so a second run could hand someone a
  different set of cards than the ones already on their screen. The unique
  index on `(user_id, season_id, drop_date)` plus `ignoreDuplicates` makes two
  overlapping runs safe: the loser inserts nothing and therefore writes no cards.
- **A quiet night is released but not announced.** Serving fewer is correct as
  the pool thins (§6.1) and the empty state is honest (§9.6), but pushing
  "tonight's drop is live" to someone who will open it and find nothing turns
  that honest screen into a broken promise.

The pool is loaded once per season in bulk and indexed in memory —
`buildDrop` needs five different histories per member, and fetching those per
person would be 1,500 round trips a night. `drop_cards` is read in chunks of
100 drop ids because the filter travels in the URL: a full cohort over eight
weeks is ~16,800 drops, and one `.in()` listing them all is 600 KB of query
string, which works on a fixture of forty and fails in week two of a real
season.

Every cron endpoint verifies `CRON_SECRET` with a constant-time compare and
answers `404` — not `401` — so an unauthenticated caller learns nothing about
which endpoints exist. A missing secret fails closed.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3100/api/cron/claim-sweep
```

The mechanic itself is pure and lives in `packages/logic/src/claim.ts`, so it is
covered by unit tests rather than only by running it: seats occupied by an open
window are never promoted into, a deadline exactly equal to `now` has not lapsed
(someone may be mid-checkout), and re-running the plan against its own output is
a no-op.

### Console settings the migrations cannot make

- **Authentication → Phone** must be enabled, with an SMS provider. Until it
  is, `/auth/v1/settings` reports `"phone": false` and the funnel's OTP step
  fails closed with a plain-language message. Add a **test OTP number** to walk
  the funnel end to end without sending real SMS.
- `NEXT_PUBLIC_SUPABASE_URL` is the bare origin. A trailing `/rest/v1` makes
  every request fail with `PGRST125`, which from the client is indistinguishable
  from a working RLS policy — `pnpm db:verify` refuses to run against one.

---

## Layout

```
apps/
  web/            Next.js 16 — (marketing) now, (app) next
  admin/          Next.js 16 — admin.noghost.app (Phase 2)
packages/
  config/         Brand constants, season defaults, zod env schema, the §9 copy library
  types/          Domain types, Postgres enums, the supabase-js Database type
  logic/          Every season mechanic, pure and unit-tested
  db/             Supabase clients (browser/server/service) + the seed layer
  ui-tokens/      Archetype tokens for Tailwind (web) and NativeWind (mobile)
supabase/
  migrations/     The §5 schema: tables, RLS, RPCs, storage buckets
  seed.sql        Generated — 1 season + 40 profiles, all prefixed `deadbeef-`
```

### Two rules that shape everything

**Mechanics live in `packages/logic`, and they are pure.** No `Date.now()`
anywhere — "now" is always an argument. That is what makes
`season-simulation.test.ts` possible: 56 days of hourly sweeps across four
seeds, asserting that no chat can reach a closed state without a closure note
being delivered to someone. If that test fails, the product's one promise is
broken.

**State transitions are Postgres RPCs, not client writes.** Every RLS policy
that could let a client set a state column is deliberately absent. "Nobody can
be ghosted" is enforced in the database, not the UI.

---

## Deviations from the spec

Three, all deliberate, all flagged for the §2 decision log:

1. **`profiles` gains `age_min`, `age_max`, `interests`.** §6.1's hard age
   filter and interest-overlap score have no columns to read without them, and
   §7.2's onboarding already collects both.
2. **An `admin_users` table exists.** Every table's RLS references "admin", and
   a policy cannot read the `ADMIN_EMAILS` env var that §7.3 specifies. The
   admin app syncs this table from that allow-list; TOTP and password remain
   app-layer factors.
3. **The `e164` domain type.** §5 writes `phone e164 text unique`, which isn't
   valid SQL. The intent is an E.164-constrained column, and it appears on two
   tables, so it became a real domain.

## Copy awaiting sign-off

Everything user-facing is verbatim from spec §9, with four exceptions where
§9 specifies content requirements rather than finished prose:

- The five email bodies in `packages/config/src/copy/lifecycle.ts`
  (`signedOff: false`; subjects and SMS are verbatim).
- The Apply CTA section on the home page — §9.1 names the section but gives no
  wording.
- The application funnel's step statements and the under-review screen. §9
  covers the marketing site, the notifications and the closure notes; it does
  not cover the funnel interior.
- The Terms, Privacy, and Community Standards pages. These are drafted and
  **have not been legally reviewed.** A dating app holding selfies and phone
  numbers should not launch on a template.

## Before launch

- Provision the dedicated Supabase project (locked decision #17 — it must not
  share a project with anything else).
- Rate-limit and BotID the waitlist action and every auth endpoint.
- Source photography (LuxWeb workflow Phase 4); the profile-photo pipeline is
  wired but there are no assets yet.
- Set Supabase usage alerts at ~70% and decide the spend-cap posture
  consciously.
