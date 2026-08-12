-- ============================================================================
-- 0014 — a graduated member cannot start a new chat
-- ============================================================================
--
-- §6.5: confirming a graduation ends the season for both people. Their other
-- chats close with the "met someone" note and the drops stop.
--
-- `respond_connect` never checked the answering member's status, which left the
-- one door §6.5 forgets to shut. A connect that was already sitting in the inbox
-- when they graduated could still be accepted afterwards — opening a brand-new
-- seven-day chat for somebody whose season is over, and telling the sender
-- their connect was accepted by a person who has stopped looking. Declining
-- stays available, because answering a waiting question is the opposite of the
-- problem: it is how the sender gets an answer instead of silence.
--
-- Only `found_someone` is refused. `paused` is deliberately left alone: pausing
-- means "no drops, and nobody sees you in theirs" (§6.4), and a connect already
-- in the inbox predates the pause. Answering it yes is a member choosing to
-- come back, not a hole in the mechanic.
--
-- Written into the RPC rather than only into the UI, for the reason 0013 gives:
-- the screen is where a rule is pleasant, and the function is where it is true.
--
-- Idempotent: safe to re-run. This is 0011's `respond_connect` — the enum casts
-- on `message_kind` are preserved verbatim — plus the guard.

create or replace function respond_connect(p_connect_id uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_connect connects;
  v_season seasons;
  v_status member_status;
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
    -- Checked only on the accept path: a graduated member may still say no, and
    -- taking that away would leave the sender with the silence the product is
    -- named after.
    select status into v_status from profiles where id = v_uid;
    if v_status = 'found_someone' then
      raise exception 'Your season ended when you found someone'
        using errcode = 'check_violation';
    end if;

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
      case
        when v_connect.reply_voice_path is not null then 'voice'::message_kind
        else 'text'::message_kind
      end,
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

comment on function respond_connect(uuid, boolean) is
  'Answer a connect. Accepting opens the chat and seeds message #1 from the '
  'reply. A member who has graduated may decline but not accept — §6.5 ends '
  'their season, and a new seven-day chat would reopen it.';
