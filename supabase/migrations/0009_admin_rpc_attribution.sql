-- NoGhost — make admissions decisions attributable. Spec §7.3.
--
-- `advance_application` records who acted by calling `audit()`, which derives
-- the actor from `auth.uid()`. Called with the service role there is no user
-- context, so `audit()` falls back to the zero uuid and every admission,
-- rejection and waitlist decision lands in `admin_audit` credited to nobody.
--
-- Spec §7.3 requires "every mutation → admin_audit", and an audit trail that
-- cannot name the reviewer is not an audit trail. So the function becomes
-- callable by the admin's own session, and guards itself.
--
-- Idempotent: safe to re-run.

create or replace function advance_application(
  p_application_id uuid, p_new_status application_status, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_app applications;
  v_season seasons;
  v_allowed application_status[];
  v_uid uuid := (select auth.uid());
begin
  /*
   * Two callers are legitimate:
   *   - an admin, acting through the console (v_uid is their id, so the audit
   *     row names them)
   *   - the service role, from a cron job such as claim-sweep (no user
   *     context at all, hence the null check)
   *
   * `anon` never reaches here — it has no EXECUTE grant. An ordinary member
   * does reach here and is refused, which is the case that matters: self
   * admission would be the whole game.
   */
  if v_uid is not null and not is_admin() then
    raise exception 'Only an admin can advance an application'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_app from applications where id = p_application_id for update;
  if v_app is null then
    raise exception 'Application not found' using errcode = 'no_data_found';
  end if;

  v_allowed := case v_app.status
    when 'applied'          then array['phone_verified','rejected']::application_status[]
    when 'phone_verified'   then array['selfie_submitted','rejected']::application_status[]
    when 'selfie_submitted' then array['under_review','rejected']::application_status[]
    when 'under_review'     then array['admitted','waitlisted','rejected']::application_status[]
    when 'admitted'         then array['claimed','expired']::application_status[]
    when 'waitlisted'       then array['admitted','rejected','expired']::application_status[]
    else array[]::application_status[]
  end;

  if not (p_new_status = any(v_allowed)) then
    raise exception 'Cannot move an application from % to %', v_app.status, p_new_status
      using errcode = 'check_violation';
  end if;

  select * into v_season from seasons where id = v_app.season_id;

  update applications
     set status = p_new_status,
         admitted_at = case when p_new_status = 'admitted' then now() else admitted_at end,
         claim_deadline = case
           when p_new_status = 'admitted'
           then now() + make_interval(hours => v_season.claim_hours)
           else claim_deadline end,
         rejection_reason = coalesce(p_reason, rejection_reason)
   where id = p_application_id;

  if p_new_status = 'admitted' then
    perform enqueue_notification(v_app.user_id, 'email', 'admitted_claim',
      jsonb_build_object('application_id', p_application_id));
    perform enqueue_notification(v_app.user_id, 'sms', 'admitted_claim',
      jsonb_build_object('application_id', p_application_id));
  end if;

  perform audit('advance_application', 'applications', p_application_id,
    jsonb_build_object('from', v_app.status, 'to', p_new_status));
end;
$$;

-- Callable by a signed-in admin. Still revoked from anon, which is what keeps
-- the function off the public API surface entirely.
grant execute on function advance_application(uuid, application_status, text) to authenticated;
revoke execute on function advance_application(uuid, application_status, text) from anon;

-- ============ ADMIN AUDIT VISIBILITY ============
-- The trail is written by definer functions running as the owner, so no insert
-- policy is needed. Admins read it; nobody else can, and nobody can amend it.

comment on table admin_audit is
  'Append-only. Written by security-definer functions; no client insert, update or delete policy exists.';
