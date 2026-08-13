-- ============================================================================
-- 0017 — resolving a report
-- ============================================================================
--
-- Spec §7.3 Moderation: "Reports queue (chat context view), tone-check fail
-- rates, warn/remove member (removal closes their chats with a neutral system
-- note to partners — even removal doesn't ghost anyone), photo re-review."
--
-- `reports` already carries `resolution`, `resolved_by` and `resolved_at`, and
-- admins have `for all` on the table — so the console could have written those
-- three columns directly. It doesn't, for the same reason the admissions queue
-- doesn't write `applications.status` directly: a removal is not one column.
-- It is a status change, an unknown number of chat closures, a closure note and
-- a system message per chat, and an audit row, and all of it has to be one
-- transaction or a member ends up removed with their conversations still open.
--
-- The three resolutions, and what each actually does:
--
--   dismissed  records the decision. The report stands as history and the two
--              people stay invisible to each other — `has_report_between()`
--              does not consult `resolution`, deliberately. Dismissing means
--              "no action against them", not "the reporter was wrong to be
--              uncomfortable", and un-hiding somebody who was reported would
--              be the app overruling that.
--
--   warned     records the decision, and nothing else yet. Delivering a warning
--              needs member-facing copy, and §9 does not specify any — spec §13
--              is explicit that missing copy is a question, not a thing to
--              improvise. The decision and its audit row are real; the message
--              is a gap, and a visible one.
--
--   removed    the whole mechanic. Status → `removed`, which drops them out of
--              every future drop (the eligibility pass in `packages/logic`
--              skips anyone who is not `active`), and every open chat they have
--              closes with §9.2's `removal` note — to *all* their partners, not
--              only the reporter. "Even removal doesn't ghost anyone" is the
--              spec's phrase and this loop is where it is true or isn't.
--
-- The status write needs no escape hatch. `freeze_identity_after_admission()`
-- returns early for `is_admin()`, and this runs on the admin's own session
-- rather than the service role — the same decision 0009 made for
-- `advance_application`, and for the same reason: an audit trail that cannot
-- name the reviewer is not an audit trail.
--
-- Idempotent: safe to re-run.

create or replace function resolve_report(
  p_report_id uuid, p_resolution text, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_report reports;
  v_chat uuid;
  v_closed int := 0;
begin
  if not is_admin() then
    raise exception 'Only an admin can resolve a report'
      using errcode = 'insufficient_privilege';
  end if;
  if p_resolution not in ('dismissed','warned','removed') then
    raise exception 'Unknown resolution: %', p_resolution using errcode = 'check_violation';
  end if;

  select * into v_report from reports where id = p_report_id for update;
  if v_report is null then
    raise exception 'Report not found' using errcode = 'no_data_found';
  end if;

  /*
   * Refused rather than silently re-applied. Two admins opening the queue at
   * once is ordinary, and the second one needs to be told the decision is
   * already made — not to quietly remove somebody a colleague had dismissed.
   */
  if v_report.resolution is not null then
    raise exception 'That report was already resolved as %', v_report.resolution
      using errcode = 'check_violation';
  end if;

  update reports
     set resolution = p_resolution, resolved_by = v_uid, resolved_at = now()
   where id = p_report_id;

  if p_resolution = 'removed' then
    update profiles set status = 'removed' where id = v_report.reported_id;

    /*
     * Every open chat, with everyone — not just the reporter's. A removed
     * member's other conversations are the ones most at risk of becoming
     * silence: those partners have no idea anything happened and would simply
     * stop hearing back.
     */
    for v_chat in
      select c.id from chats c
      where c.state in ('active','date_scheduled','post_date_checkin')
        and v_report.reported_id in (c.user_a, c.user_b)
    loop
      update chats set state = 'closed_by_user', closed_at = now() where id = v_chat;

      insert into closure_notes (chat_id, from_user, template_id, delivered_at)
      values (v_chat, null, 'removal', now());

      insert into messages (chat_id, sender_id, kind, body)
      values (v_chat, null, 'system'::message_kind, 'removal');

      v_closed := v_closed + 1;
    end loop;
  end if;

  perform audit('resolve_report', 'reports', p_report_id, jsonb_build_object(
    'resolution', p_resolution,
    'reported_id', v_report.reported_id,
    'reason', v_report.reason,
    'chats_closed', v_closed,
    -- The admin's own note, not the reporter's. `reports.detail` is the
    -- member's account and stays where it is; this is the reviewer's reasoning,
    -- which belongs in the trail rather than on the report.
    'note', coalesce(p_note, '')
  ));
end;
$$;

revoke execute on function resolve_report(uuid, text, text) from public, anon;
grant execute on function resolve_report(uuid, text, text) to authenticated;

comment on function resolve_report(uuid, text, text) is
  'Admin-only. Records the decision, and for `removed` also sets the member''s '
  'status and closes every open chat they have with §9.2''s neutral note — '
  'spec §7.3, "even removal doesn''t ghost anyone".';
