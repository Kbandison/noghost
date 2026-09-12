-- ============================================================================
-- 0037 — the camera was still focusing
-- ============================================================================
--
-- A genuine applicant scored 0.0001 on Face Liveness while their own reference
-- image matched their profile photo at 99.99. Rekognition was certain of the
-- face and certain it was not live.
--
-- It looked like a lighting failure and was not. `DetectFaces` put that
-- capture's face brightness at 83.6 against 82.5 for the same person's best
-- attempt — lit fine. Across four attempts in one afternoon, brightness ordered
-- randomly against the score; the two brightest captures produced the two
-- lowest passing numbers. Sharpness ordered perfectly:
--
--     liveness   frame sharpness                        mean
--     89.4       96.6  96.6  96.6  96.6  95.5           96.4
--     73.5       94.1  95.5  97.5  97.5  94.1           95.7
--     64.6       95.5  95.5  95.5  95.5  92.2           94.8
--      0.0001    60.5  78.6  89.9  89.9  83.1           80.4
--
-- The failed capture opens at 60.5 and climbs while every scoring attempt holds
-- flat above 92. Whole-frame exposure drifted 28% across it against under 5%
-- elsewhere, and it was the fastest start of the four — twelve seconds from
-- opening the session. The camera was still focusing and metering while it was
-- being filmed, so the measurement moved while it was taken.
--
-- Two columns, so that stops being something somebody has to re-derive from
-- JPEGs by hand. They are evidence and calibration, never a gate: nothing in
-- the schema or the application may refuse a person for a soft capture, and the
-- only thing a low sharpness buys is the offer of a retake.
-- ============================================================================

alter table public.verification_challenges
  add column if not exists capture_sharpness numeric,
  add column if not exists capture_brightness numeric;

comment on column public.verification_challenges.capture_sharpness is
  'Rekognition DetectFaces Quality.Sharpness for the WORST frame of this capture, 0-100. The worst rather than the mean because a still-focusing camera recovers, and averaging hides the opening frames that are the whole signal. Null when nothing could be measured. Never a gate — a low value offers the applicant a retake and nothing else.';

comment on column public.verification_challenges.capture_brightness is
  'Rekognition DetectFaces Quality.Brightness for the worst frame, 0-100. Recorded for calibration and deliberately NOT part of any decision: across the four captures that motivated this migration it ordered randomly against the liveness score, while sharpness ordered perfectly.';

-- ============================================================================
-- The reviewer reads the best attempt, not the last one
-- ============================================================================
--
-- 0032 surfaced the most recent completed attempt. The applicant above had
-- ALREADY PASSED — 89.4 at 16:05 — then pressed "Do it again", scored 0.0001 on
-- an unfocused camera, and filed hours later. Most-recent threw the passing
-- attempt away. Retaking a check you have already passed must not be able to
-- cost you anything.
--
-- This concedes nothing to an attacker. Against somebody retrying until they
-- get through, most-recent and best-of-N are the same policy: their passing
-- attempt is also their last one, so both admit them. What bounds that is the
-- rate limit on opening a session — six per ten minutes per applicant — not
-- which row is read. And a spoof does not get luckier with repetition; a
-- printed face scores near zero every time rather than drifting up to 89. So
-- most-recent was buying no security and charging honest people for a second
-- thought.
--
-- `attempts` and the score range ride along so best-of-N stays honest. A
-- reviewer who is shown the best of five attempts and not told there were five
-- is being flattered, not informed.
-- ============================================================================

-- Dropped rather than replaced: `create or replace function` cannot change a
-- `returns table` signature, and this adds three columns to it. Postgres would
-- refuse with "cannot change return type of existing function", which in a
-- migration reads as a syntax problem rather than the deliberate widening it is.
drop function if exists public.review_verification(uuid);

create function public.review_verification(p_user_id uuid)
returns table (
  selfie_path text,
  frame_paths text[],
  challenge_passed boolean,
  liveness_confidence numeric,
  liveness_checked_at timestamptz,
  liveness_score numeric,
  liveness_passed boolean,
  auto_reason text,
  auto_checked_at timestamptz,
  phone_verified_at timestamptz,
  capture_sharpness numeric,
  liveness_attempts integer,
  liveness_lowest numeric
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
    select v.selfie_path,
           v.frame_paths,
           v.challenge_passed,
           c.confidence        as liveness_confidence,
           c.consumed_at       as liveness_checked_at,
           v.liveness_score,
           v.liveness_passed,
           v.auto_reason,
           v.auto_checked_at,
           v.phone_verified_at,
           c.capture_sharpness,
           coalesce(t.attempts, 0)::integer as liveness_attempts,
           t.lowest            as liveness_lowest
      from verifications v
      /*
       * The attempt the application rests on: highest confidence, ties to the
       * earlier one — the attempt they took without knowing how it went.
       *
       * `confidence is not null` is what separates "they finished and this is
       * the result" from a session claimed but never written back. Ordering
       * nulls out rather than filtering the row means somebody with no scored
       * attempt still shows their frames, with a null confidence that every
       * reader downstream already treats as "nobody checked".
       */
      left join lateral (
        select vc.confidence, vc.consumed_at, vc.capture_sharpness
          from verification_challenges vc
         where vc.user_id = v.user_id
           and vc.consumed_at is not null
         order by vc.confidence desc nulls last, vc.consumed_at asc
         limit 1
      ) c on true
      /* How many they took, and how low it went. Best-of-N shown without the N
         is a flattering number, not an informative one. */
      left join lateral (
        select count(*) as attempts, min(vc.confidence) as lowest
          from verification_challenges vc
         where vc.user_id = v.user_id
           and vc.consumed_at is not null
           and vc.confidence is not null
      ) t on true
     where v.user_id = p_user_id;
end;
$$;

revoke all on function public.review_verification(uuid) from public, anon;
grant execute on function public.review_verification(uuid) to authenticated, service_role;

comment on function public.review_verification(uuid) is
  'Everything the review team needs about one verification, reading the applicant''s BEST completed liveness attempt rather than their most recent — retaking a check you already passed must not cost you anything, and against an attacker who retries the two policies are identical anyway. Reports the attempt count and lowest score alongside, so best-of-N is shown honestly. Admin-only, enforced here rather than by the caller.';
