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
| 1 | Application funnel (phone OTP → profile → selfie) | ✅ Complete (runs on seed data) |
| 2 | Admissions + Stripe | ⬜ |
| 3 | The Drop + Connect | ⬜ |
| 4 | Chat + Fuse + Dates | ⬜ |
| 5 | Notifications + PWA | ⬜ |
| 6 | Mobile (Expo) | ⬜ |
| 7 | Ops hardening + launch | ⬜ |

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
