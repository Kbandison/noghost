-- ============================================================================
-- 0031 — a video instead of three photographs
-- ============================================================================
--
-- 0029 built a pose challenge: three stills, a server-issued sequence, and a
-- yaw threshold. It works — the first real face through it passed, and the
-- frames and the verdict are in this table. What it cannot do is stated plainly
-- in its own comments: it defeats a stolen photograph, and it does not defeat a
-- screen, a printed mask, or video injected into the camera stream.
--
-- Those comments said defeating that tier "is what a liveness vendor sells",
-- without noticing that AWS is one. Amazon Rekognition Face Liveness is part of
-- the same service the pose check already used. It takes a short video rather
-- than stills, returns a 0-100 confidence, and is built specifically to catch
-- presentation attacks and bypass attacks — the two things the pose sequence
-- was honest about missing.
--
-- The first person to walk the old step said "I also thought it was a live
-- capture." They were describing the product they expected, and they were
-- right to expect it: this is an app whose entire premise is that the person is
-- real.
--
-- ---------------------------------------------------------------------------
-- The same row, holding different evidence
-- ---------------------------------------------------------------------------
--
-- `verification_challenges` keeps its name and its shape. It was always "one
-- verification attempt, recorded before it is judged, unreadable by the
-- applicant" — and that is still exactly what it is. What changes is the
-- evidence inside it: a session id and a confidence score rather than a list of
-- poses, and reference plus audit images rather than three frames we captured
-- ourselves.
--
-- `poses` stops being required rather than being dropped. Attempts made under
-- 0029 are real verification history — somebody's application may still be in
-- the review queue with a pose result attached — and deleting the column would
-- throw that away to tidy up a name.
-- ============================================================================

alter table public.verification_challenges
  alter column poses drop not null;

alter table public.verification_challenges
  drop constraint if exists verification_challenges_poses_present;

-- The rule 0029 wanted was "a sequence has at least two steps". Kept for rows
-- that still carry poses, and silent about rows that never will.
alter table public.verification_challenges
  add constraint verification_challenges_poses_present
  check (poses is null or array_length(poses, 1) >= 2);

alter table public.verification_challenges
  add column if not exists liveness_session_id text,
  add column if not exists confidence numeric;

alter table public.verification_challenges
  drop constraint if exists verification_challenges_confidence_range;
alter table public.verification_challenges
  add constraint verification_challenges_confidence_range
  check (confidence is null or (confidence >= 0 and confidence <= 100));

/*
 * One session, one attempt. Rekognition refuses a session id that has already
 * been used, and an id that could be recorded twice here is an id somebody
 * could try to attach to a second application.
 */
create unique index if not exists verification_challenges_session_idx
  on public.verification_challenges (liveness_session_id)
  where liveness_session_id is not null;

comment on column public.verification_challenges.liveness_session_id is
  'Rekognition Face Liveness session. Expires three minutes after it is created, along with the reference and audit images — which is why they are copied into storage the moment the result comes back.';
comment on column public.verification_challenges.confidence is
  'Face Liveness confidence, 0-100: how sure Rekognition is that a live person was in front of the camera. Distinct from liveness_score on verifications, which is the face MATCH against their photos.';
comment on column public.verification_challenges.poses is
  'The pose sequence, for attempts made before 0031. Null for every Face Liveness attempt. Kept because an application in the review queue may still rest on one.';

comment on table public.verification_challenges is
  'One identity verification attempt, recorded before it is judged and unreadable by the applicant — they may neither read the challenge nor write the verdict. Since 0031 the evidence is a Face Liveness session; before that it was a pose sequence.';
