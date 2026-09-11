-- ============================================================================
-- 0033 — which door did you come through
-- ============================================================================
--
-- Since 0031 an application can be admitted two ways: a person reads it in the
-- console, or the automated identity check clears it and `advance_application`
-- is called by the server. The applicant is told the same thing either way, and
-- what they are told is written as a statement of fact:
--
--   "You're in. A person read your application and said yes."
--   "A person on the review team reads it and compares your selfie to your
--    photos."
--
-- For an auto-admitted applicant both sentences are false, and they render
-- together — so that person is told, twice, that a human looked at their face
-- when nobody did. That is not a tone problem. It is the product describing a
-- review process it did not perform.
--
-- ---------------------------------------------------------------------------
-- What an applicant may and may not be told
-- ---------------------------------------------------------------------------
--
-- The rule everywhere else in verification is that somebody is never told they
-- *failed* a check: a score teaches an attacker what to aim at, and an honest
-- applicant reading "liveness check failed" hears an accusation.
--
-- This is the other side of that rule, and it is not in tension with it. The
-- outcome of an application is not a secret — an admitted member gets an email,
-- an SMS and a claim deadline within seconds. Telling them *how* they were
-- admitted adds nothing an attacker can use, because anybody learning it is
-- already through the door. What is withheld is the number and the failure,
-- not the result.
--
-- So: this says which door, and only to the person who walked through it.
-- ============================================================================

create or replace function public.my_application_route()
returns table (
  status application_status,
  admitted_automatically boolean
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  /*
   * `auth.uid()`, not `current_user`. Inside a SECURITY DEFINER function
   * `current_user` is the function's owner, so a check against it is true for
   * everybody — which shipped as a live hole once already (see 0024) and is
   * the single easiest mistake to repeat in this file.
   */
  if v_uid is null then
    return;
  end if;

  return query
    select a.status,
           /*
            * The audit row `runIdentityMatch` writes after an automatic
            * admission. Asked of `admin_audit` rather than of a flag on the
            * application, because the trail is the thing that is actually
            * true — a column could drift from it, and then this screen would
            * be describing a decision that never happened for a second time.
            */
           exists (
             select 1
               from admin_audit aa
              where aa.action = 'auto_admit'
                and aa.target_table = 'applications'
                and aa.target_id = a.id
           ) as admitted_automatically
      from applications a
     where a.user_id = v_uid
     order by a.created_at desc
     limit 1;
end;
$$;

revoke all on function public.my_application_route() from public, anon;
grant execute on function public.my_application_route() to authenticated;

comment on function public.my_application_route() is
  'The caller''s own application status, and whether it was admitted by the automated identity check rather than by a person. Members may know the outcome of their own application and how it was reached; they may never know a score or that they fell short of one.';
