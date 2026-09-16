-- ============================================================================
-- 0043 — a bio is not a job title
-- ============================================================================
--
-- `occupation` predates the bio. It was the one free-text field outside the
-- prompts, so "About you" was a box asking what you do for a living; 0042 gave
-- members somewhere to write in their own words, and a job title next to it is
-- the same question asked worse. Anyone whose work is worth saying can say it
-- in the bio, in their own framing, without the app deciding that a job is a
-- fact about a person on the order of how tall they are.
--
-- So: `occupation` out, `weight_lb` in, and an erasure bug from 0042 fixed.
--
-- ---------------------------------------------------------------------------
-- Pounds, when height is centimetres
-- ---------------------------------------------------------------------------
--
-- Deliberate, and not an inconsistency to tidy up later. Height is collected as
-- feet and inches and stored in centimetres, which round-trips exactly because
-- a centimetre is finer than an inch: 5'10" is 177.8cm, stores as 178, reads
-- back as 70.07in, displays as 5'10".
--
-- Weight does not have that property in reverse. A kilogram is coarser than a
-- pound, so 180lb stores as 82kg and reads back as 181lb — a member watching
-- their own number change after they typed it, every time, with no way to make
-- it stick. Stored in the unit it is collected and displayed in, there is no
-- conversion to be wrong.
--
-- `integer` rather than `numeric` for a second reason: Supabase returns numeric
-- over the wire as a *string*, and every place that treats one as a number has
-- to remember to. An integer arrives as an integer.
--
-- ---------------------------------------------------------------------------
-- The bug: 0042 added a column erasure forgot
-- ---------------------------------------------------------------------------
--
-- `delete_own_account` nulls every field a member wrote about themselves, and
-- it has been enumerating them by name since 0018. `bio` was added after that
-- list was written and never added to it — so a member who deleted their
-- account kept a paragraph of their own words in the row, under the name
-- "Someone". §10's promise is that erasure leaves no profile behind.
--
-- The list is the failure mode: a column added anywhere else in this schema is
-- erased only if somebody remembers this function exists. `weight_lb` is added
-- to it in the same breath as the column itself, which is the only discipline
-- that has ever worked here.
-- ============================================================================

/*
 * The view is dropped rather than replaced, and that is the whole reason this
 * is careful.
 *
 * `create or replace view` can only APPEND columns — 0042 had to hang `bio` off
 * the end for exactly that reason. Removing `occupation` is not something a
 * replace can express, so the view goes and comes back.
 *
 * What a drop takes with it, and what therefore has to be restated below:
 *   - the SELECT grant to `authenticated` (from 0006). Without it every member
 *     read of a profile fails with permission denied.
 *   - the comment (from 0028).
 *
 * What it does NOT change: the view is owned by the migration role and carries
 * no `security_invoker`, so it reads `profiles` as its owner and the row gate
 * stays `can_view_profile(id)` in the WHERE clause — same as it has been since
 * 0006. This rebuild deliberately keeps that shape rather than quietly moving
 * the authorization somewhere new.
 */
drop view public.visible_profiles;

alter table public.profiles
  drop column occupation,
  add column weight_lb integer check (weight_lb between 60 and 600);

comment on column public.profiles.weight_lb is
  'Optional, in pounds — the unit it is collected and shown in, so nothing is lost to a kg round-trip. Bounded only widely enough to catch a typo (a digit dropped or added), never to judge a number a member entered about themselves.';

create view public.visible_profiles as
  select id,
         first_name,
         extract(year from age(birthdate::timestamp with time zone))::integer as age,
         gender,
         neighborhood,
         height_cm,
         weight_lb,
         bio,
         coalesce((
           select jsonb_agg(photo.value order by ((photo.value ->> 'order')::integer))
             from jsonb_array_elements(p.photos) photo(value)
            where coalesce((photo.value ->> 'approved')::boolean, false)
         ), '[]'::jsonb) as photos,
         prompts,
         voice_intro_path,
         interests,
         lat,
         lng
    from profiles p
   where can_view_profile(id);

comment on view public.visible_profiles is
  'Profile fields a member is allowed to see, gated by can_view_profile(). Includes the rounded point so the client can bucket a distance; excludes travel_radius_km, which is matching input only.';

grant select on public.visible_profiles to authenticated;
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
         weight_lb = null,
         bio = null,
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
