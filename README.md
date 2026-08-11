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
| 3 | The Drop + Connect — member-facing | ⬜ |
| 4 | Chat + Fuse + Dates | ⬜ |
| 5 | Notifications + PWA | ⬜ |
| 6 | Mobile (Expo) | ⬜ |
| 7 | Ops hardening + launch | ⬜ |

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
pnpm test        # 135 tests, all in packages/logic
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
pnpm db:seed:remote --purge         # remove exactly those rows and their storage objects
pnpm db:verify                      # did the migrations apply, and does anon get denied?
pnpm db:verify:writes               # sign in as a member; do the writes work, and do the boundaries hold?

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
`pi_deadbeef_…` payment intent.

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
