-- ============================================================================
-- 0034 — refuse it at the door
-- ============================================================================
--
-- 0033's moderation runs at filing, in `runIdentityMatch`, which is the last
-- step of the funnel. So an explicit photo uploaded at step seven is accepted,
-- written to the `photos` bucket — which is **publicly readable** — and sits
-- there for the rest of the funnel. It is never refused. At submission the
-- application quietly goes to a human instead of being auto-admitted, and the
-- applicant is told nothing at all.
--
-- Three things wrong with that, in order of how much they matter:
--
--   1. The content is accepted and stored at a public URL.
--   2. The person who uploaded it is not told, so they cannot fix it, and
--      learn only when their application is slow for reasons nobody explains.
--   3. A reviewer is handed explicit content to look at, which is a thing to
--      ask of a person only when there is no alternative.
--
-- Screening moves to the upload itself. A refused photo is deleted from storage
-- immediately and the applicant is told why, in the moment, while they still
-- have the picker open.
--
-- ---------------------------------------------------------------------------
-- Why the result is stored rather than recomputed
-- ---------------------------------------------------------------------------
--
-- Filing still has to decide whether the set can be auto-approved, and asking
-- Rekognition a second time about photos it already judged would double the
-- cost and could disagree with the answer the applicant was given. So each
-- screening is recorded against the path.
--
-- Which is safe to trust precisely because the bucket has no update policy:
-- `members replace only their own photos` covers replacing a row they own, and
-- `uploadImage` uses a fresh uuid with `upsert: false` every time. The bytes at
-- a screened path cannot change after it was screened.
-- ============================================================================

create table if not exists public.photo_screenings (
  -- The storage path, which is already unique per upload: `<user>/<uuid>.<ext>`.
  path text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  verdict text not null,
  reason text,
  /*
   * What Rekognition actually returned. Kept because a policy this opinionated
   * will be argued with — somebody's holiday photo will be refused and the only
   * useful answer to "why" is the labels and their confidences, not a
   * paraphrase written months earlier.
   */
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint photo_screenings_verdict
    check (verdict in ('ok', 'refuse', 'needs-a-person'))
);

create index if not exists photo_screenings_user_idx
  on public.photo_screenings (user_id, created_at desc);

/*
 * RLS on, no policies. Every read and write is the service role.
 *
 * An applicant who could read this learns which labels fired and at what
 * confidence, which is a map for getting something past it. An applicant who
 * could write it could mark their own photo clean. Neither is a query they have
 * any business running: what they are entitled to is the verdict on their own
 * upload, and the server action hands them that directly.
 */
alter table public.photo_screenings enable row level security;

comment on table public.photo_screenings is
  'One moderation result per uploaded photo, recorded at upload. Trustworthy at filing because the photos bucket has no update policy and every upload takes a fresh uuid — the bytes at a screened path cannot change afterwards.';
comment on column public.photo_screenings.verdict is
  'ok = auto-approvable. refuse = deleted from storage and the applicant was told. needs-a-person = kept, and a reviewer decides.';
