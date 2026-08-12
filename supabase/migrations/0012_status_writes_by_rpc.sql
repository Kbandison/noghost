-- ============================================================================
-- 0012 — the trigger that silently defeated its own escape hatch
-- ============================================================================
--
-- `freeze_identity_after_admission()` ended with an unconditional
--
--   new.status := old.status;
--
-- and its comment explained the intent: "Members never move their own status;
-- `pause_account` and the graduation RPCs do, running as definer."
--
-- A `SECURITY DEFINER` function does not exempt a trigger. Triggers fire for
-- every UPDATE regardless of who or what issued it, and the guard above them is
-- `is_admin()`, which reads `auth.uid()` — still the original caller inside a
-- definer function. So the two RPCs whose entire job is to write
-- `profiles.status` had their writes reverted by the trigger, in the same
-- statement, with no error:
--
--   set_account_paused()   pausing or unpausing your own account
--   respond_graduation()   both members → 'found_someone' on a mutual graduation
--
-- Proven rather than inferred: a **service role** update of `profiles.status`
-- also returns success and changes nothing, because the service role is not an
-- admin either. `profiles.status` was unwritable by anything in the system.
--
-- Note this is the *second* bug behind pausing an account. 0011 fixed the enum
-- cast, which made the RPC stop erroring — and revealed this one, because a
-- function that silently does nothing looks exactly like a function that works.
-- `pnpm db:verify:writes` caught it precisely because it asserts the *effect*
-- (`status = 'paused'`) rather than the absence of an error.
--
-- The fix has two halves:
--
--   1. The trigger raises instead of silently reverting. A client that tries to
--      write `status` now gets told, rather than watching the value snap back.
--      Guarded by `is distinct from`, so an update that merely carries the same
--      status along — a full-row upsert from a profile editor — still passes.
--   2. The RPCs announce themselves with a transaction-local setting. Chosen
--      over a column-level `revoke update (status)` because that would require
--      enumerating every other column of `profiles` in a GRANT, where adding a
--      column later and forgetting it breaks profile editing with no warning.
--
-- `set_config(..., true)` is transaction-scoped, and PostgREST gives each
-- request its own transaction, so the flag cannot leak between callers. Each
-- function still clears it immediately after the write it needs it for.
--
-- Idempotent: safe to re-run.

create or replace function freeze_identity_after_admission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() then
    new.updated_at := now();
    return new;
  end if;

  if exists (
    select 1 from applications a
    where a.user_id = new.id and a.status in ('admitted','claimed')
  ) then
    if new.first_name is distinct from old.first_name
       or new.birthdate is distinct from old.birthdate
       or new.gender    is distinct from old.gender then
      raise exception 'Identity fields are locked after admission. Contact support.'
        using errcode = 'check_violation';
    end if;
  end if;

  /*
   * Status moves only through the RPCs that own it. Refused out loud rather
   * than reverted in silence: the old behaviour returned success and changed
   * nothing, which is the failure mode that hides longest.
   */
  if new.status is distinct from old.status
     and coalesce(current_setting('noghost.status_write', true), '') <> 'on' then
    raise exception 'Account status is changed by set_account_paused() or the graduation RPCs, not directly'
      using errcode = 'insufficient_privilege';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function set_account_paused(p_paused boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('noghost.status_write', 'on', true);

  update profiles
     set status = case
                    when p_paused then 'paused'::member_status
                    else 'active'::member_status
                  end
   where id = (select auth.uid())
     and status in ('active','paused');

  perform set_config('noghost.status_write', 'off', true);
end;
$$;

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

  perform set_config('noghost.status_write', 'on', true);
  update profiles set status = 'found_someone' where id in (v_chat.user_a, v_chat.user_b);
  perform set_config('noghost.status_write', 'off', true);

  insert into exit_surveys (user_id, season_id)
  values (v_chat.user_a, v_chat.season_id), (v_chat.user_b, v_chat.season_id)
  on conflict (user_id, season_id) do nothing;

  perform audit('graduate', 'chats', v_chat.id, '{}'::jsonb);
end;
$$;

comment on function freeze_identity_after_admission() is
  'Identity freezes at admission; status is RPC-only. A SECURITY DEFINER caller '
  'does not exempt a trigger, so the RPCs that own status set '
  'noghost.status_write for the statement that needs it.';
