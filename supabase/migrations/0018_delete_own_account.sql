-- ============================================================================
-- 0018 — deleting your account
-- ============================================================================
--
-- The privacy page promises this in Settings and it has never been possible.
-- Four foreign keys refuse a `delete from profiles`:
--
--   season_members.user_id             no ON DELETE rule → RESTRICT
--   reports.resolved_by                no ON DELETE rule → RESTRICT
--   verifications.admin_reviewed_by    no ON DELETE rule → RESTRICT
--   messages.sender_id                 ON DELETE SET NULL — and then the
--                                      `system_has_no_sender` check fires,
--                                      because a text message with a null
--                                      sender is by definition a system message
--
-- The last one is not a missing rule, it is a contradiction: the schema says
-- member messages survive their author, and also that a message with no author
-- is the app speaking. Both cannot hold.
--
-- The page also promises two things at once — "everything cascades: profile,
-- photos, messages, verification selfie, and season history" and "open chats
-- close with a system note, because your partners deserve an ending rather than
-- a disappearance". `chats.user_a/user_b` are ON DELETE CASCADE, so a real
-- cascade takes the chat and its closure note with it and the partner gets
-- exactly the disappearance the second sentence disclaims.
--
-- Resolved by erasing the person rather than deleting the rows their partners
-- are standing on:
--
--   * every open chat closes first, with §9.2's neutral `removal` note — the
--     same note a moderation removal sends, so the note cannot be read as a
--     reason
--   * their messages keep their place in the conversation and lose their
--     content; the partner's own words are untouched
--   * the profile becomes a tombstone: no name, no photos, no prompts, no
--     phone, no birthdate, no neighbourhood, no occupation, no height
--   * the verification row goes entirely — selfie path, liveness score, review
--     notes
--
-- What deliberately stays: `season_members`, which is a payment record with no
-- personal content beyond a user id that now points at a tombstone, and is what
-- a refund or an accounting question would be answered from. The privacy copy
-- is updated in the same commit to describe this rather than the cascade it
-- used to describe.
--
-- Storage is not reachable from here — objects are removed by the caller with
-- the service role, before this runs.
--
-- Idempotent: safe to re-run.

/*
 * The identity freeze has to let erasure through.
 *
 * `freeze_identity_after_admission()` refuses any change to first_name,
 * birthdate or gender once an application is admitted, and refuses status
 * changes outside the RPCs that own them (0012). Erasure is both of those at
 * once. It gets its own transaction-local flag rather than a new exception to
 * the identity rule, so the rule keeps reading as "these never change" with one
 * named door beside it.
 *
 * This supersedes 0012's definition of the same function; the status clause is
 * carried forward unchanged.
 */
create or replace function freeze_identity_after_admission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() or coalesce(current_setting('noghost.erasing', true), '') = 'on' then
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

  if new.status is distinct from old.status
     and coalesce(current_setting('noghost.status_write', true), '') <> 'on' then
    raise exception 'Account status is changed by set_account_paused() or the graduation RPCs, not directly'
      using errcode = 'insufficient_privilege';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function delete_own_account()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_chat uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  /*
   * Endings first, while the profile is still readable. Doing this after the
   * erasure would work too, but only by accident — the note is the thing the
   * partner is owed and it should not depend on the order of what follows.
   */
  for v_chat in
    select c.id from chats c
    where c.state in ('active','date_scheduled','post_date_checkin')
      and v_uid in (c.user_a, c.user_b)
  loop
    update chats set state = 'closed_by_user', closed_at = now() where id = v_chat;

    insert into closure_notes (chat_id, from_user, template_id, delivered_at)
    values (v_chat, null, 'removal', now());

    insert into messages (chat_id, sender_id, kind, body)
    values (v_chat, null, 'system'::message_kind, 'removal');
  end loop;

  /*
   * Content out, position kept.
   *
   * A voice note becomes a text row: `content_present` requires a `voice_path`
   * for `kind = 'voice'`, and the object it pointed at is already gone. The
   * body is a marker rather than an empty string because the same constraint
   * requires text messages to have one, and because the partner is better
   * served by a gap that says what it is.
   */
  update messages
     set kind = 'text'::message_kind,
         body = '[removed]',
         voice_path = null,
         voice_duration_ms = null
   where sender_id = v_uid and kind in ('text','voice');

  -- The reply that started a chat is the same words in another table.
  update connects
     set reply_text = '[removed]', reply_voice_path = null
   where from_user = v_uid;

  delete from verifications where user_id = v_uid;

  perform set_config('noghost.erasing', 'on', true);
  update profiles
     set first_name = 'Someone',
         birthdate = '1900-01-01',
         neighborhood = null,
         height_cm = null,
         occupation = null,
         photos = '[]'::jsonb,
         prompts = '[]'::jsonb,
         voice_intro_path = null,
         phone = null,
         status = 'removed'
   where id = v_uid;
  perform set_config('noghost.erasing', 'off', true);

  /*
   * Audited without naming them twice. `audit()` credits `auth.uid()`, which is
   * the member themselves — the trail records that this account erased itself,
   * which is exactly the question anyone reading it later would be asking.
   */
  perform audit('delete_own_account', 'profiles', v_uid, '{}'::jsonb);
end;
$$;

revoke execute on function delete_own_account() from public, anon;
grant execute on function delete_own_account() to authenticated;

comment on function delete_own_account() is
  'Erases the caller: chats close with §9.2''s neutral note first, message and '
  'reply content is replaced, the verification row is deleted and the profile '
  'becomes a tombstone. Rows their partners are standing on are kept, because '
  'deleting the chat would take the ending with it. Storage objects are removed '
  'by the caller before this runs.';
