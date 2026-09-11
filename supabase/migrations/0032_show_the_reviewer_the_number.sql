-- ============================================================================
-- 0032 — show the reviewer the number
-- ============================================================================
--
-- 0031 stores a Face Liveness confidence on every attempt. Nothing reads it.
--
-- `review_verification` returns `liveness_score`, which is the face *match*
-- against their photographs, and `challenge_passed`, which is a boolean derived
-- from the confidence at filing time. The confidence itself — the 0-100 saying
-- how sure Rekognition was that a live person was in front of the camera — sits
-- on `verification_challenges` and is surfaced nowhere.
--
-- Which makes the threshold unauditable. Nobody can answer "is 85 right for our
-- applicants" without the distribution of real scores, and nobody can see the
-- distribution. The first genuine check through this system scored 64.6; AWS's
-- own guidance puts a moderate threshold at 50-60 and a deepfake-grade one at
-- 80-90, and explicitly declines to recommend a single number because it
-- depends on the population. Ours is unknowable while the number is invisible.
--
-- ---------------------------------------------------------------------------
-- Two numbers, and the screen must not conflate them
-- ---------------------------------------------------------------------------
--
--   liveness_confidence   Was a live human there? About the video.
--   liveness_score        Is that human the person in these photographs?
--                         About identity. A convincing stranger scores high.
--
-- They answer different questions and fail for different reasons — bad light
-- drops the first, an eight-year-old profile photo drops the second — and a
-- reviewer who cannot tell them apart cannot act on either.
-- ============================================================================

create or replace function public.review_verification(p_user_id uuid)
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
    select v.selfie_path,
           v.frame_paths,
           v.challenge_passed,
           /*
            * From the most recent attempt they actually completed.
            *
            * An applicant may open several sessions — a camera that would not
            * start, a room too dark, a retake. Abandoned ones never get a
            * confidence, so `consumed_at not null` is what distinguishes "they
            * tried and this is the result" from "they tried and gave up". The
            * last completed one is the one their application rests on.
            */
           c.confidence      as liveness_confidence,
           c.consumed_at     as liveness_checked_at,
           v.liveness_score,
           v.liveness_passed,
           v.auto_reason,
           v.auto_checked_at,
           v.phone_verified_at
      from verifications v
      left join lateral (
        select vc.confidence, vc.consumed_at
          from verification_challenges vc
         where vc.user_id = v.user_id
           and vc.consumed_at is not null
         order by vc.consumed_at desc
         limit 1
      ) c on true
     where v.user_id = p_user_id;
end;
$$;

revoke all on function public.review_verification(uuid) from public, anon;
grant execute on function public.review_verification(uuid) to authenticated, service_role;

comment on function public.review_verification(uuid) is
  'Everything the review team needs about one verification, including the columns revoked from the applicant themselves and the liveness confidence from their most recent completed attempt. Admin-only, enforced here rather than by the caller.';
