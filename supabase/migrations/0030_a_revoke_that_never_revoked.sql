-- ============================================================================
-- 0030 — a revoke that never revoked
-- ============================================================================
--
-- 0006 contains these two lines, and has since the schema was first written:
--
--   revoke select (admin_notes) on verifications from authenticated;
--   revoke select (rejection_reason) on applications from authenticated;
--
-- Neither has ever done anything.
--
-- In Postgres a column-level privilege is additive, not subtractive. A
-- table-level `GRANT SELECT` covers every column in the table, present and
-- future, and revoking one column out of it does not narrow it — there is
-- nothing at the column level to take away. Both tables still hold table-wide
-- SELECT for `authenticated` (Supabase grants it by default), so both revokes
-- were no-ops that read, in the migration, exactly like controls.
--
-- What that means in practice, today, before this migration runs:
--
--   * An applicant can read `applications.rejection_reason` — the internal
--     note explaining why a person turned them down. §7.3 requires a reason
--     precisely because it is written frankly, on the understanding that the
--     subject never sees it.
--   * An applicant can read `verifications.admin_notes` — the review team's
--     private assessment of their photographs and their face.
--
-- Neither is a hole anybody opened. Both are a control that was written down,
-- looked correct in review, and was never once exercised by a test — which is
-- the only reason it survived this long. It was found by a verifier for 0029
-- asserting that an applicant *cannot* read their own liveness score, and
-- getting back the score.
--
-- The fix is the only one that works: drop the table-wide grant and hand back
-- SELECT on exactly the columns a member is allowed to see. RLS still decides
-- *which rows*; this decides which columns, which RLS cannot express.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- applications
-- ---------------------------------------------------------------------------
--
-- Everything except the reason. An applicant reading their own status, their
-- claim deadline and their waitlist position is the product working — those
-- are on screens they are shown.
revoke select on public.applications from authenticated;
grant select (
  id, user_id, season_id, status, admitted_at, claim_deadline,
  waitlist_position, created_at
) on public.applications to authenticated;

-- ---------------------------------------------------------------------------
-- verifications
-- ---------------------------------------------------------------------------
--
-- Narrower, because almost nothing on this row is the subject's business. They
-- may know that a selfie of theirs exists and that their phone was verified.
-- The verdict, the score, the pose result, the frames and both sets of notes
-- are the review team talking to itself — and a score is a number somebody
-- tunes their next attempt against.
--
-- `review_verification()` (0029) is how an admin reads the rest, and it asks
-- `is_admin()` itself rather than trusting the caller.
revoke select on public.verifications from authenticated;
grant select (
  id, user_id, selfie_path, phone_verified_at, created_at
) on public.verifications to authenticated;

comment on table public.verifications is
  'Identity verification. Members may read only that their selfie and phone check exist — every judgement column is admin-only, enforced by column grants because RLS restricts rows and cannot express this.';
