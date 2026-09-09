-- ============================================================================
-- 0023 — a broadcast, which is the one notification nobody writes in advance
-- ============================================================================
--
-- §7.3's Comms module: "Broadcast announcement to cohort (in-app + optional
-- email)". Every other notification in the product is a §9 template with a
-- payload of ids; a broadcast is prose somebody types, sent to everyone in a
-- season at once.
--
-- Done as an RPC rather than from the console with the service role, for the
-- reason `resolve_report` and `set_photo_approval` are: the authorisation
-- belongs in SQL. A loop in TypeScript holding a service key would put "only an
-- admin may do this" in the one place where forgetting it is invisible — the
-- key bypasses RLS, so the check would be the only thing standing there.
--
-- It is also one statement rather than N round trips. A 300-member cohort is
-- 300 or 600 inserts, and a console request that half-succeeds would leave some
-- of the season announced to and the rest not, with no way to tell which.
--
-- Idempotent: safe to re-run. Sending the same broadcast twice is not — see
-- the note on that below.

create or replace function broadcast_to_season(
  p_season_id uuid,
  p_body text,
  p_email boolean default false
) returns int language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_body text := btrim(p_body);
begin
  if not is_admin() then
    raise exception 'Only an admin can broadcast to a season'
      using errcode = 'insufficient_privilege';
  end if;

  if v_body is null or length(v_body) = 0 then
    raise exception 'A broadcast needs something to say' using errcode = 'check_violation';
  end if;

  /*
   * Bounded because this is prose in a jsonb payload that lands on a phone.
   * Long enough for an announcement, short enough that it cannot become a
   * newsletter nobody reads on a lock screen.
   */
  if length(v_body) > 1000 then
    raise exception 'A broadcast is at most 1000 characters'
      using errcode = 'string_data_right_truncation';
  end if;

  if not exists (select 1 from seasons where id = p_season_id) then
    raise exception 'No such season' using errcode = 'no_data_found';
  end if;

  /*
   * Sent to `season_members` — the people who paid and are in — rather than to
   * every profile or every admitted application. An admitted application
   * nobody claimed is not somebody in this season, and mailing them the
   * cohort's announcements would be telling them they are in it.
   *
   * `insert ... select` rather than a loop: every member is announced to or
   * none is.
   */
  insert into notifications (user_id, channel, template, payload)
  select
    sm.user_id,
    channel.value::notif_channel,
    'broadcast',
    jsonb_build_object('body', v_body, 'season_id', p_season_id)
  from season_members sm
  cross join (
    select 'inapp' as value
    union all
    select 'email' where p_email
  ) as channel
  where sm.season_id = p_season_id;

  get diagnostics v_count = row_count;

  /*
   * The body is audited in full, not summarised. §7.3 says every mutation lands
   * in `admin_audit`, and for this one the mutation *is* the words — a trail
   * saying "broadcast, 300 recipients" would record that something was said to
   * the whole cohort without recording what.
   */
  perform audit('broadcast', 'seasons', p_season_id, jsonb_build_object(
    'body', v_body,
    'email', p_email,
    'rows', v_count
  ));

  return v_count;
end;
$$;

revoke execute on function broadcast_to_season(uuid, text, boolean) from public, anon;
grant execute on function broadcast_to_season(uuid, text, boolean) to authenticated;

comment on function broadcast_to_season(uuid, text, boolean) is
  'Admin-only. Writes one `broadcast` notification per season member, in-app '
  'and optionally by email, and audits the words themselves. Deliberately not '
  'idempotent: re-running it announces twice, because two identical '
  'announcements are two decisions somebody made.';

/**
 * A test send — §7.3's "template preview/test-send for every notification".
 *
 * Deliberately can only target the caller. `enqueue_notification` is not granted
 * to `authenticated` at all, and the reason to keep it that way is that a
 * console button which can send any template to any user id is a button that
 * can be used to text a member something the product never decided to say.
 * Testing what a notification looks like does not require sending it to anybody
 * but yourself.
 */
create or replace function send_test_notification(
  p_template text,
  p_channel notif_channel,
  p_payload jsonb default '{}'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if not is_admin() then
    raise exception 'Only an admin can send a test notification'
      using errcode = 'insufficient_privilege';
  end if;

  /*
   * `notifications.user_id` references `profiles`, so an admin who has never
   * been through the funnel has no row to receive anything. Raised with the
   * reason rather than surfacing a foreign-key violation, which would read as
   * a bug in the console.
   */
  if not exists (select 1 from profiles where id = v_uid) then
    raise exception 'A test send needs a member profile on this account — sign into the member app with it first'
      using errcode = 'no_data_found';
  end if;

  insert into notifications (user_id, channel, template, payload)
  values (v_uid, p_channel, p_template, coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('test', true))
  returning id into v_id;

  perform audit('send_test_notification', 'notifications', v_id, jsonb_build_object(
    'template', p_template,
    'channel', p_channel
  ));

  return v_id;
end;
$$;

revoke execute on function send_test_notification(text, notif_channel, jsonb) from public, anon;
grant execute on function send_test_notification(text, notif_channel, jsonb) to authenticated;

comment on function send_test_notification(text, notif_channel, jsonb) is
  'Admin-only, and can only ever send to the caller. Marks the payload '
  '`test: true` so a real delivery can be told from a rehearsal.';
