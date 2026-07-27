-- NoGhost — state transition RPCs. Spec §5.
--
-- "Every state transition is a Postgres RPC (security definer) that validates
--  the transition, writes the audit trail, and enqueues notifications. Clients
--  never mutate state columns directly. This is what makes 'nobody can be
--  ghosted' enforceable at the database layer, not the UI layer."
--
-- Every function below sets an explicit `search_path`; a definer function
-- without one is hijackable through a shadowed schema.

-- ============ HELPERS ============

create or replace function audit(
  p_action text, p_table text, p_target uuid, p_detail jsonb default '{}'
) returns void language sql security definer set search_path = public as $$
  insert into admin_audit (admin_id, action, target_table, target_id, detail)
  values (coalesce((select auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid),
          p_action, p_table, p_target, p_detail);
$$;

create or replace function enqueue_notification(
  p_user uuid, p_channel notif_channel, p_template text, p_payload jsonb default '{}'
) returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, channel, template, payload)
  values (p_user, p_channel, p_template, p_payload);
$$;

create or replace function season_for_chat(p_chat uuid)
returns seasons language sql stable security definer set search_path = public as $$
  select s.* from seasons s join chats c on c.season_id = s.id where c.id = p_chat;
$$;

-- ============ THE DROP ============

/*
 * Pass on a card. Silent and final — the other person is never told, and there
 * is deliberately no notification here.
 */
create or replace function pass_card(p_card_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select d.user_id into v_owner
  from drop_cards dc join drops d on d.id = dc.drop_id
  where dc.id = p_card_id and dc.action = 'pending' and d.released_at is not null;

  if v_owner is null then
    raise exception 'Card not found, already answered, or not yet released'
      using errcode = 'no_data_found';
  end if;
  if v_owner <> (select auth.uid()) then
    raise exception 'Not your card' using errcode = 'insufficient_privilege';
  end if;

  update drop_cards set action = 'passed', acted_at = now() where id = p_card_id;
end;
$$;

/*
 * Send a connect. Validates card ownership, that a reply is actually present,
 * and the one-per-pair-per-season rule — the same checks as
 * `validateConnect` in packages/logic, enforced again here because the client
 * is never the guard.
 */
create or replace function send_connect(
  p_card_id uuid,
  p_prompt_ref jsonb,
  p_reply_text text default null,
  p_reply_voice_path text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_card record;
  v_connect_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  if coalesce(trim(p_reply_text), '') = '' and p_reply_voice_path is null then
    raise exception 'Reply to something specific. It''s the only way to say hello here.'
      using errcode = 'check_violation';
  end if;

  select dc.id, dc.action, dc.shown_profile_id, d.user_id, d.season_id, d.released_at
    into v_card
  from drop_cards dc join drops d on d.id = dc.drop_id
  where dc.id = p_card_id;

  if v_card is null then
    raise exception 'Card not found' using errcode = 'no_data_found';
  end if;
  if v_card.user_id <> v_uid then
    raise exception 'Not your card' using errcode = 'insufficient_privilege';
  end if;
  if v_card.released_at is null then
    raise exception 'That drop hasn''t landed yet' using errcode = 'check_violation';
  end if;
  if v_card.action <> 'pending' then
    raise exception 'You''ve already answered this card' using errcode = 'check_violation';
  end if;

  -- Atomic with the card flip: the pair constraint on `connects` is the real
  -- lock, so two concurrent sends cannot both succeed.
  insert into connects (
    season_id, from_user, to_user, drop_card_id, prompt_ref, reply_text, reply_voice_path
  ) values (
    v_card.season_id, v_uid, v_card.shown_profile_id, p_card_id,
    p_prompt_ref, nullif(trim(p_reply_text), ''), p_reply_voice_path
  ) returning id into v_connect_id;

  update drop_cards set action = 'connected', acted_at = now() where id = p_card_id;

  perform enqueue_notification(
    v_card.shown_profile_id, 'push', 'connect_received',
    jsonb_build_object('connect_id', v_connect_id, 'prompt_ref', p_prompt_ref)
  );

  return v_connect_id;
end;
$$;

/*
 * Answer a connect. Accepting opens a chat with the fuse already running and
 * seeds the reply as message #1. Declining delivers the kind auto-note.
 *
 * There is no third option. Ignoring a connect is not reachable from the API,
 * which is the mechanical form of the product's promise.
 */
create or replace function respond_connect(p_connect_id uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_connect connects;
  v_season seasons;
  v_chat_id uuid;
begin
  select * into v_connect from connects where id = p_connect_id for update;

  if v_connect is null then
    raise exception 'Connect not found' using errcode = 'no_data_found';
  end if;
  if v_connect.to_user <> v_uid then
    raise exception 'Not your connect to answer' using errcode = 'insufficient_privilege';
  end if;
  if v_connect.status <> 'pending' then
    raise exception 'Already answered' using errcode = 'check_violation';
  end if;

  select * into v_season from seasons where id = v_connect.season_id;

  if p_accept then
    update connects set status = 'accepted', responded_at = now() where id = p_connect_id;

    insert into chats (season_id, connect_id, user_a, user_b, fuse_expires_at)
    values (
      v_connect.season_id, v_connect.id, v_connect.from_user, v_connect.to_user,
      now() + make_interval(days => v_season.fuse_days)
    ) returning id into v_chat_id;

    -- The connect reply becomes message #1 of the new chat (spec §6.2).
    insert into messages (chat_id, sender_id, kind, body, voice_path)
    values (
      v_chat_id, v_connect.from_user,
      case when v_connect.reply_voice_path is not null then 'voice' else 'text' end,
      v_connect.reply_text, v_connect.reply_voice_path
    );

    perform enqueue_notification(
      v_connect.from_user, 'push', 'connect_accepted',
      jsonb_build_object('chat_id', v_chat_id)
    );
    return v_chat_id;
  end if;

  update connects set status = 'declined', responded_at = now() where id = p_connect_id;

  -- The decline note is a real answer delivered to the sender, with no reply
  -- channel. It is written here, in the same transaction as the decline, so a
  -- decline can never exist without its note.
  insert into notifications (user_id, channel, template, payload)
  values (
    v_connect.from_user, 'inapp', 'connect_declined',
    jsonb_build_object('connect_id', p_connect_id, 'template_id', 'decline_auto')
  );

  return null;
end;
$$;

-- ============ DATES ============

create or replace function propose_date(
  p_chat_id uuid, p_scheduled_for timestamptz, p_place_name text, p_place_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_chat chats;
  v_date_id uuid;
  v_partner uuid;
begin
  select * into v_chat from chats where id = p_chat_id;

  if v_chat is null or v_uid not in (v_chat.user_a, v_chat.user_b) then
    raise exception 'Chat not found' using errcode = 'no_data_found';
  end if;
  if v_chat.state not in ('active','date_scheduled','post_date_checkin') then
    raise exception 'This chat is closed' using errcode = 'check_violation';
  end if;

  -- The anti-loophole window (spec §6.3). Without it, a date parked far in the
  -- future would freeze a fuse indefinitely.
  if p_scheduled_for < now() + interval '2 hours' then
    raise exception 'Pick a time at least 2 hours from now' using errcode = 'check_violation';
  end if;
  if p_scheduled_for > now() + interval '14 days' then
    raise exception 'Pick a time within the next 14 days' using errcode = 'check_violation';
  end if;

  insert into dates (chat_id, proposed_by, scheduled_for, place_name, place_note)
  values (p_chat_id, v_uid, p_scheduled_for, p_place_name, p_place_note)
  returning id into v_date_id;

  v_partner := case when v_chat.user_a = v_uid then v_chat.user_b else v_chat.user_a end;
  perform enqueue_notification(
    v_partner, 'push', 'date_proposed',
    jsonb_build_object('date_id', v_date_id, 'place', p_place_name, 'day', p_scheduled_for)
  );

  return v_date_id;
end;
$$;

/*
 * Confirm or decline a proposed date. Only the other person can confirm —
 * self-confirming would let one member pause a fuse unilaterally.
 */
create or replace function respond_to_date(p_date_id uuid, p_confirm boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_date dates;
  v_chat chats;
begin
  select * into v_date from dates where id = p_date_id for update;
  if v_date is null then
    raise exception 'Date not found' using errcode = 'no_data_found';
  end if;

  select * into v_chat from chats where id = v_date.chat_id;
  if v_uid not in (v_chat.user_a, v_chat.user_b) then
    raise exception 'Not your date' using errcode = 'insufficient_privilege';
  end if;
  if v_date.proposed_by = v_uid then
    raise exception 'The other person confirms the date, not you'
      using errcode = 'insufficient_privilege';
  end if;
  if v_date.status <> 'proposed' then
    raise exception 'Already answered' using errcode = 'check_violation';
  end if;

  if not p_confirm then
    update dates set status = 'declined' where id = p_date_id;
    return;
  end if;

  update dates set status = 'confirmed', confirmed_at = now() where id = p_date_id;

  -- The fuse pauses here, and only here.
  update chats
     set state = 'date_scheduled', fuse_paused_at = now()
   where id = v_date.chat_id and state = 'active';

  perform enqueue_notification(u, 'push', 'date_confirmed',
    jsonb_build_object('date_id', p_date_id, 'place', v_date.place_name,
                       'day', v_date.scheduled_for))
  from unnest(array[v_chat.user_a, v_chat.user_b]) as u;
end;
$$;

create or replace function cancel_date(p_date_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_date dates;
  v_chat chats;
  v_banked interval;
begin
  select * into v_date from dates where id = p_date_id for update;
  select * into v_chat from chats where id = v_date.chat_id for update;

  if v_uid not in (v_chat.user_a, v_chat.user_b) then
    raise exception 'Not your date' using errcode = 'insufficient_privilege';
  end if;
  if v_date.status <> 'confirmed' then
    raise exception 'That date isn''t confirmed' using errcode = 'check_violation';
  end if;

  update dates set status = 'cancelled' where id = p_date_id;

  if v_chat.state = 'date_scheduled' then
    -- Resume with whatever was banked, floored at 48h: a cancellation never
    -- insta-kills a chat (spec §6.3).
    v_banked := greatest(
      v_chat.fuse_expires_at - coalesce(v_chat.fuse_paused_at, now()),
      interval '48 hours'
    );
    update chats
       set state = 'active',
           fuse_paused_at = null,
           fuse_expires_at = now() + v_banked,
           warned_48h = (v_banked <= interval '48 hours'),
           warned_24h = (v_banked <= interval '24 hours')
     where id = v_chat.id;
  end if;
end;
$$;

/*
 * Answer the post-date check-in. The answer is private forever: the partner
 * learns the outcome (the chat continues, or a note arrives), never the vote.
 */
create or replace function answer_checkin(p_date_id uuid, p_answer checkin_answer)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_chat chats;
  v_season seasons;
  v_mine checkin_answer;
  v_theirs checkin_answer;
  v_partner uuid;
begin
  select c.* into v_chat from chats c join dates d on d.chat_id = c.id where d.id = p_date_id;
  if v_chat is null or v_uid not in (v_chat.user_a, v_chat.user_b) then
    raise exception 'Check-in not found' using errcode = 'no_data_found';
  end if;

  insert into date_checkins (date_id, user_id, answer, answered_at)
  values (p_date_id, v_uid, p_answer, now())
  on conflict (date_id, user_id) do update
    set answer = excluded.answer, answered_at = now();

  v_partner := case when v_chat.user_a = v_uid then v_chat.user_b else v_chat.user_a end;
  select answer into v_theirs from date_checkins where date_id = p_date_id and user_id = v_partner;
  v_mine := p_answer;

  if v_mine = 'close' or v_theirs = 'close' then
    perform close_chat(v_chat.id, 'closure_02', null, null);
    return 'closed';
  end if;

  if v_mine = 'continue' and v_theirs = 'continue' then
    select * into v_season from seasons where id = v_chat.season_id;
    update chats
       set state = 'active',
           fuse_paused_at = null,
           fuse_expires_at = now() + make_interval(days => v_season.fuse_days),
           warned_48h = false,
           warned_24h = false
     where id = v_chat.id;
    return 'continued';
  end if;

  return 'pending';
end;
$$;

-- ============ CLOSING A CHAT ============

/*
 * Close a chat with a note.
 *
 * The tone check on `p_personal_line` runs in the application before this is
 * called (it needs an API round-trip, which Postgres cannot make) and its
 * verdict arrives as `p_tone_check_passed`. Null means "not run" — a
 * template-only closure, or a moderation outage. A failed check never blocks
 * the close; the member either edits the line or drops it (spec §6.6).
 *
 * A closure note is written in the same transaction as the state change, so
 * there is no window in which a chat is closed and silent.
 */
create or replace function close_chat(
  p_chat_id uuid,
  p_template_id text,
  p_personal_line text default null,
  p_tone_check_passed boolean default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_chat chats;
  v_partner uuid;
begin
  select * into v_chat from chats where id = p_chat_id for update;

  if v_chat is null then
    raise exception 'Chat not found' using errcode = 'no_data_found';
  end if;
  if v_uid is not null and v_uid not in (v_chat.user_a, v_chat.user_b) then
    raise exception 'Not your chat' using errcode = 'insufficient_privilege';
  end if;
  if v_chat.state in
     ('closed_fuse','closed_by_user','closed_graduated','closed_season_end') then
    return;  -- idempotent: re-running a sweep must be safe
  end if;

  update chats set state = 'closed_by_user', closed_at = now() where id = p_chat_id;

  insert into closure_notes (chat_id, from_user, template_id, personal_line,
                             tone_check_passed, delivered_at)
  values (p_chat_id, v_uid, p_template_id, p_personal_line,
          p_tone_check_passed, now());

  insert into messages (chat_id, sender_id, kind, body)
  values (p_chat_id, null, 'system', p_template_id);

  if v_uid is not null then
    v_partner := case when v_chat.user_a = v_uid then v_chat.user_b else v_chat.user_a end;
    perform enqueue_notification(v_partner, 'push', 'closure_received',
      jsonb_build_object('chat_id', p_chat_id));
  end if;

  perform audit('close_chat', 'chats', p_chat_id,
    jsonb_build_object('template_id', p_template_id));
end;
$$;

-- ============ GRADUATION ============

create or replace function propose_graduation(p_chat_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if not is_chat_participant(p_chat_id) then
    raise exception 'Not your chat' using errcode = 'insufficient_privilege';
  end if;
  insert into graduations (chat_id, proposed_by) values (p_chat_id, v_uid) returning id into v_id;
  return v_id;
end;
$$;

/*
 * Confirm a graduation. Both accounts go `found_someone`, every other open chat
 * for either member closes with the "met someone" template, and both get the
 * exit survey. Declining is private — the proposer is not notified, and the
 * chat simply continues (spec §6.5).
 */
create or replace function respond_graduation(p_graduation_id uuid, p_confirm boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_grad graduations;
  v_chat chats;
  v_other uuid;
begin
  select * into v_grad from graduations where id = p_graduation_id for update;
  select * into v_chat from chats where id = v_grad.chat_id;

  if v_uid not in (v_chat.user_a, v_chat.user_b) then
    raise exception 'Not your chat' using errcode = 'insufficient_privilege';
  end if;
  if v_grad.proposed_by = v_uid then
    raise exception 'The other person confirms this' using errcode = 'insufficient_privilege';
  end if;

  if not p_confirm then
    update graduations set status = 'declined', responded_at = now() where id = p_graduation_id;
    return;  -- private and reversible; the chat carries on
  end if;

  update graduations
     set status = 'confirmed', confirmed_by = v_uid, responded_at = now()
   where id = p_graduation_id;

  update chats set state = 'closed_graduated', closed_at = now() where id = v_chat.id;
  insert into closure_notes (chat_id, from_user, template_id, delivered_at)
  values (v_chat.id, v_uid, 'closure_03', now());

  -- Every other open chat for either of them ends with words, not silence.
  for v_other in
    select c.id from chats c
    where c.id <> v_chat.id
      and c.state in ('active','date_scheduled','post_date_checkin')
      and (c.user_a in (v_chat.user_a, v_chat.user_b)
        or c.user_b in (v_chat.user_a, v_chat.user_b))
  loop
    update chats set state = 'closed_by_user', closed_at = now() where id = v_other;
    insert into closure_notes (chat_id, from_user, template_id, delivered_at)
    values (v_other, null, 'closure_03', now());
  end loop;

  update profiles set status = 'found_someone' where id in (v_chat.user_a, v_chat.user_b);

  insert into exit_surveys (user_id, season_id)
  values (v_chat.user_a, v_chat.season_id), (v_chat.user_b, v_chat.season_id)
  on conflict (user_id, season_id) do nothing;

  perform audit('graduate', 'chats', v_chat.id, '{}'::jsonb);
end;
$$;

-- ============ ACCOUNT & SAFETY ============

create or replace function set_account_paused(p_paused boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update profiles
     set status = case when p_paused then 'paused' else 'active' end
   where id = (select auth.uid())
     and status in ('active','paused');
end;
$$;

/*
 * File a report. The exclusion is immediate — both people drop out of each
 * other's eligibility the moment this commits, before any admin sees it
 * (spec §5). The reported member is never told.
 */
create or replace function report_member(
  p_reported_id uuid, p_reason text, p_chat_id uuid default null, p_detail text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid = p_reported_id then
    raise exception 'You cannot report yourself' using errcode = 'check_violation';
  end if;

  insert into reports (reporter_id, reported_id, chat_id, reason, detail)
  values (v_uid, p_reported_id, p_chat_id, p_reason, p_detail)
  returning id into v_id;

  return v_id;
end;
$$;

-- ============ ADMISSIONS (service role / admin) ============

/*
 * The only path through the application status machine. Illegal transitions
 * raise rather than silently no-op, so a bad admin action fails loudly.
 */
create or replace function advance_application(
  p_application_id uuid, p_new_status application_status, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_app applications;
  v_season seasons;
  v_allowed application_status[];
begin
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

-- ============ EXECUTE GRANTS ============
-- Member-facing RPCs. Each one re-validates the caller internally, so being
-- callable is not the same as being permissive.

grant execute on function
  pass_card(uuid),
  send_connect(uuid, jsonb, text, text),
  respond_connect(uuid, boolean),
  propose_date(uuid, timestamptz, text, text),
  respond_to_date(uuid, boolean),
  cancel_date(uuid),
  answer_checkin(uuid, checkin_answer),
  close_chat(uuid, text, text, boolean),
  propose_graduation(uuid),
  respond_graduation(uuid, boolean),
  set_account_paused(boolean),
  report_member(uuid, text, uuid, text)
  to authenticated;

-- Service-role and admin only. Not granted to `authenticated`.
revoke execute on function
  advance_application(uuid, application_status, text),
  audit(text, text, uuid, jsonb),
  enqueue_notification(uuid, notif_channel, text, jsonb)
  from public, anon, authenticated;
