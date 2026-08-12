-- ============================================================================
-- 0011 — two CASE expressions that could never be assigned to an enum column
-- ============================================================================
--
-- `case when … then 'voice' else 'text' end` has type `text`, not
-- `message_kind`. A bare `'voice'` literal in the same position would work —
-- Postgres resolves an unknown-type literal to the target column's type — but
-- once the literals are branches of a CASE the result is resolved to `text`
-- first, and there is no cast from text to an enum. So the statement fails:
--
--   column "kind" is of type message_kind but expression is of type text
--
-- Two functions carried the mistake, and both are load-bearing:
--
--   respond_connect()     accepting a connect. It creates the chat, then seeds
--                         message #1 from the sender's reply — and died on that
--                         insert, so the whole transaction rolled back. Nobody
--                         could accept a connect. Ever.
--   set_account_paused()  pausing your own account. Same shape, on
--                         profiles.status / member_status.
--
-- Neither was reachable from a UI until now, which is why it took building the
-- inbox to find it, and `pnpm db:verify` could not have: it probes that each
-- function *exists* by calling it with deliberate junk and accepting any error
-- that is not PGRST202. An error is exactly what a broken body produces too.
-- `pnpm db:verify:writes` now pauses and unpauses a real member, which catches
-- this class by executing it rather than by naming it.
--
-- The fix is the explicit cast on each branch. Casting the whole CASE would
-- work equally well; casting the literals keeps the intent readable and means
-- a future third branch cannot quietly reintroduce the problem.
--
-- Idempotent: safe to re-run.

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

create or replace function set_account_paused(p_paused boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update profiles
     set status = case
                    when p_paused then 'paused'::member_status
                    else 'active'::member_status
                  end
   where id = (select auth.uid())
     and status in ('active','paused');
end;
$$;
