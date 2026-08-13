-- ============================================================================
-- 0016 — a report must not be a silent ending
-- ============================================================================
--
-- `report_member()` inserts a row and stops. Everything protective happens as a
-- consequence: `has_report_between()` makes `can_view_profile()` false in both
-- directions, which removes each person from the other's drop eligibility —
-- exactly what the Community Standards page promises.
--
-- But it reaches further than drops. Every read layer in the app drops a row
-- whose partner is unreadable, with good reason: a nameless chat is worse than
-- no chat. So the moment a report is filed, the conversation *disappears* from
-- both sides — including from the person who was reported, who is given no
-- ending at all.
--
-- That is the one thing this product refuses to do. §10 lists "assert zero
-- silent endings possible" as a release gate, and a chat that evaporates is the
-- purest form of the thing the app is named against. The standards page even
-- describes the correct behaviour for the neighbouring case: "If we remove
-- someone, their open chats close with a neutral system note to their partners.
-- Even removal doesn't ghost anyone."
--
-- So a report closes the chat the same way, with §9.2's `removal` note. It says
-- the conversation was closed by NoGhost and that it is nothing they did. That
-- second clause is doing real work: the note has to be identical whether a chat
-- closed because its partner was reported, because its partner was removed, or
-- because its partner's *other* chat partner was removed. If a reported person
-- could tell the difference, the note would be the notification that the
-- standards page promises they will never get.
--
-- Every open chat *between these two people* closes, not just the one named in
-- the report. `p_chat_id` is context for the review team, and a report filed
-- from a drop card carries none at all — but the invisibility is mutual and
-- total either way, so any conversation left open between them would be a
-- second silent ending waiting to happen. Chats with everyone else are
-- untouched: closing those would tell third parties something happened.
--
-- Idempotent: safe to re-run.

create or replace function report_member(
  p_reported_id uuid, p_reason text, p_chat_id uuid default null, p_detail text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_chat uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;
  if v_uid = p_reported_id then
    raise exception 'You cannot report yourself' using errcode = 'check_violation';
  end if;

  /*
   * Checked before anything is written. Without it a member could file a report
   * naming any chat id at all and close a conversation between two strangers —
   * the report row itself is harmless, but the closure below is not.
   */
  if p_chat_id is not null and not exists (
    select 1 from chats where id = p_chat_id and v_uid in (user_a, user_b)
  ) then
    raise exception 'Not your chat' using errcode = 'insufficient_privilege';
  end if;

  insert into reports (reporter_id, reported_id, chat_id, reason, detail)
  values (v_uid, p_reported_id, p_chat_id, p_reason, p_detail)
  returning id into v_id;

  /*
   * Already-closed chats are skipped by the state filter, deliberately. They
   * carry a closure note of their own, and replacing a kind goodbye with a
   * neutral one would erase something the other person was told and may
   * remember.
   */
  for v_chat in
    select c.id from chats c
    where c.state in ('active','date_scheduled','post_date_checkin')
      and ((c.user_a = v_uid and c.user_b = p_reported_id)
        or (c.user_b = v_uid and c.user_a = p_reported_id))
  loop
    update chats set state = 'closed_by_user', closed_at = now() where id = v_chat;

    /*
     * `from_user` is null — the system closed this, not the reporter. That is
     * also what keeps the reporter out of it: a note attributed to them would
     * be a signed accusation delivered to the person they reported.
     */
    insert into closure_notes (chat_id, from_user, template_id, delivered_at)
    values (v_chat, null, 'removal', now());

    insert into messages (chat_id, sender_id, kind, body)
    values (v_chat, null, 'system'::message_kind, 'removal');
  end loop;

  return v_id;
end;
$$;

comment on function report_member(uuid, text, uuid, text) is
  'Files a report and closes every open chat between the two people with '
  '§9.2''s neutral `removal` note. The protective effect (drop exclusion, mutual '
  'invisibility) follows from has_report_between(); this function exists so the '
  'conversation ends with words instead of vanishing.';
