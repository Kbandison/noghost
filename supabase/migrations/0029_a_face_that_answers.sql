-- ============================================================================
-- 0029 — a face that answers
-- ============================================================================
--
-- §7.2 calls the last step of the funnel "selfie liveness". What shipped was
-- `<input type="file" capture="user">`. On a phone that opens the camera, which
-- looks like a liveness check and is not one — `capture` is a hint about which
-- app to launch, and any picture already in the roll satisfies it. On a laptop
-- it is a plain file picker.
--
-- So the strongest claim the product makes — community standards, verbatim:
-- "every member is phone-verified and selfie-verified before day one" — rested
-- on the applicant choosing to cooperate. And `verifications.liveness_score`
-- has existed since 0002, is rendered on the reviewer's screen, and has never
-- been written by anything except the seed. Every real applicant reads "no
-- liveness score" next to their photograph.
--
-- This migration is the storage for a check that actually runs: a short pose
-- sequence chosen server-side at the moment it is asked for, answered live,
-- and then — once there are photos to compare against — a face comparison.
--
-- ---------------------------------------------------------------------------
-- What it can and cannot prove
-- ---------------------------------------------------------------------------
--
-- A face that answers a sequence it could not have known in advance was in
-- front of the camera while the sequence was being read. That defeats a stolen
-- photograph, which is the attack this is for. It does not defeat injected
-- video or a responsive deepfake held up to the lens; defeating those is what a
-- liveness vendor sells. The ceiling here is honest and narrow: it raises the
-- cost of a casual impersonation from "save an image" to "render a face on
-- demand".
--
-- ---------------------------------------------------------------------------
-- Nothing here can reject anybody
-- ---------------------------------------------------------------------------
--
-- The automation has two outcomes: admit, or hand to a person. There is no
-- third. A comparison that comes back at 60 is not evidence of fraud — it is
-- bad light, a new beard, a sibling, an eight-year-old photo, or a face the
-- model is measurably worse at. An automated reject would quietly turn away
-- real people, unevenly, with nobody to appeal to. So the machine only ever
-- skips work a human would otherwise have done.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The sequence, issued before it is answered
-- ---------------------------------------------------------------------------
--
-- A row rather than a signed cookie, for three reasons: it expires on the
-- server's clock rather than the client's, `consumed_at` makes it genuinely
-- single-use, and the issue history is what a brute-force attempt looks like
-- when somebody is fishing for a sequence they already have frames for.
create table if not exists public.verification_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The poses, in order. Text rather than an enum: the set is product policy
  -- that lives in `packages/logic/src/verification.ts`, and adding a pose
  -- should not need a migration and a deploy in lockstep.
  poses text[] not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  /*
   * The result lives here, not on `verifications`, and that is forced rather
   * than chosen: `verifications.user_id` references `profiles.id`, and there is
   * no profile row until the application is filed — the name, birthdate and
   * gender it requires are collected on the step *after* this one. This table
   * references `auth.users` instead, which exists from the moment the phone
   * code is accepted.
   *
   * So the sequence is judged here, and `fileApplication` copies the verdict
   * onto the verification row once there is one to copy it to.
   */
  passed boolean,
  frame_paths text[],
  constraint verification_challenges_poses_present check (array_length(poses, 1) >= 2),
  constraint verification_challenges_expires_after check (expires_at > issued_at)
);

create index if not exists verification_challenges_user_idx
  on public.verification_challenges (user_id, issued_at desc);

/*
 * RLS on, and deliberately no policies at all.
 *
 * Every read and write goes through the server action holding the service key.
 * A member who could SELECT their own row would read the sequence without
 * answering it, which is most of what the sequence is for; a member who could
 * UPDATE one could mark it consumed, or un-consume it. There is no query here
 * an applicant's own session has any business running, so there is no policy.
 */
alter table public.verification_challenges enable row level security;

comment on table public.verification_challenges is
  'Server-issued pose sequences for selfie verification. Single-use, short-lived, and unreadable by the applicant — the whole point is that the sequence is not known before it is answered.';

-- ---------------------------------------------------------------------------
-- What the check found
-- ---------------------------------------------------------------------------
--
-- `liveness_score` and `liveness_passed` already exist and are already on the
-- reviewer's screen, so they keep their names and finally get written:
--
--   liveness_score   the face-comparison similarity, 0-100
--   liveness_passed  the automated verdict overall — and NULL means the check
--                    could not run, which is not the same as failing it. A
--                    reviewer who reads a false as "we checked and it failed"
--                    is reviewing a different case than the one in front of
--                    them, so the column stays three-valued on purpose.
alter table public.verifications
  add column if not exists challenge_id uuid references public.verification_challenges (id) on delete set null,
  add column if not exists challenge_passed boolean,
  add column if not exists frame_paths text[],
  add column if not exists auto_reason text,
  add column if not exists auto_checked_at timestamptz;

comment on column public.verifications.liveness_passed is
  'The automated verdict. NULL means no check ran — never read it as a failure.';
comment on column public.verifications.liveness_score is
  'Face-comparison similarity, 0-100, between the live centered frame and the first profile photo.';
comment on column public.verifications.frame_paths is
  'Every frame captured for the sequence, in pose order, in the private verification-selfies bucket. selfie_path stays the centered one, which is what the reviewer compares.';
comment on column public.verifications.auto_reason is
  'Why the automated check landed where it did, in words. Internal — revoked from authenticated below.';

alter table public.verifications
  drop constraint if exists verifications_liveness_score_range;
alter table public.verifications
  add constraint verifications_liveness_score_range
  check (liveness_score is null or (liveness_score >= 0 and liveness_score <= 100));

/*
 * Same reasoning as `admin_notes` in 0006: the applicant owns the row and can
 * read it, and this column is the review team talking to itself. "Matched at
 * 71, under 92" is a number somebody would tune their next attempt against.
 */
revoke select (auto_reason) on public.verifications from authenticated;

-- ---------------------------------------------------------------------------
-- The switch
-- ---------------------------------------------------------------------------
--
-- Off by default, and off for every season that already exists. Turning
-- automated admission on is a decision about a particular cohort — the first
-- one is small enough to read by hand, and the point of reading the first one
-- by hand is finding out whether the threshold is right before it is load
-- bearing.
--
-- A switch rather than an environment variable so it can be turned off from
-- the season console at the moment somebody notices it is admitting the wrong
-- people, rather than at the speed of a deploy.
alter table public.seasons
  add column if not exists auto_admit boolean not null default false;

comment on column public.seasons.auto_admit is
  'Whether a confident automated identity match admits an application without a person reading it. Never causes a rejection — off simply means a human reads every case.';

-- ---------------------------------------------------------------------------
-- The reviewer reads it; the applicant does not
-- ---------------------------------------------------------------------------
--
-- RLS lets a member SELECT their own `verifications` row, and RLS restricts
-- rows rather than columns — so every number this migration writes would
-- otherwise be readable by the person it is about. "Matched at 71" is a score
-- somebody tunes their next attempt against, and "challenge_passed: false" is
-- a signal about which frame to redo. None of it is theirs to read.
--
-- Revoked at the column, and handed back through a function that asks
-- `is_admin()`. Same shape as `resolve_report` and `update_season`: the
-- database decides who may see this, not the page that happens to query it.
-- That is also why the admin console gets an RPC rather than a service client —
-- a service client would put the decision back in application code.
revoke select (liveness_score, liveness_passed, challenge_passed, challenge_id, frame_paths)
  on public.verifications from authenticated;

create or replace function public.review_verification(p_user_id uuid)
returns table (
  selfie_path text,
  frame_paths text[],
  challenge_passed boolean,
  liveness_score numeric,
  liveness_passed boolean,
  auto_reason text,
  auto_checked_at timestamptz,
  phone_verified_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Only an admin can read a verification'
      using errcode = 'insufficient_privilege';
  end if;

  return query
    select v.selfie_path, v.frame_paths, v.challenge_passed, v.liveness_score,
           v.liveness_passed, v.auto_reason, v.auto_checked_at, v.phone_verified_at
      from verifications v
     where v.user_id = p_user_id;
end;
$$;

revoke all on function public.review_verification(uuid) from public, anon;
grant execute on function public.review_verification(uuid) to authenticated, service_role;

comment on function public.review_verification(uuid) is
  'Everything the review team needs about one verification, including the columns revoked from the applicant themselves. Admin-only, enforced here rather than by the caller.';
