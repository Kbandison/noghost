-- ============================================================================
-- 0020 — photo approval, which has been decorative in both directions
-- ============================================================================
--
-- `profiles.photos` is `[{path, order, approved}]` and the funnel writes every
-- entry with `approved: false`, above a comment that reads "`approved` stays
-- false until a reviewer says otherwise".
--
-- No reviewer can. Nothing in the admin console has ever set the flag, and
-- nothing anywhere has ever read it — every member's photos are unapproved and
-- shown to everybody regardless. The column comment describes a control that
-- does not exist at either end.
--
-- Two halves, and the read half goes in the view rather than in the app.
--
-- `visible_profiles` is already "the only way one member reads another" — its
-- own comment says so, and the drop, the inbox and the chat all go through it.
-- Filtering there means the rule is inherited by every reader that exists and
-- every reader anyone adds later, including one that forgets. Filtering in
-- `lib/drop.ts` would have to be repeated three times today and remembered
-- forever.
--
-- Two readers deliberately keep seeing everything, and both read `profiles`
-- directly rather than through the view:
--
--   the owner   their own unapproved photos, so the settings screen can say
--               what is waiting rather than pretending they were never uploaded
--   an admin    `admins read all profiles` — a reviewer who could not see an
--               unapproved photo could not review it
--
-- Idempotent: safe to re-run.

/*
 * `create or replace view` cannot drop a column, and this only rewrites one, so
 * replace is enough. The column order and every other expression are carried
 * over unchanged from 0006 — a view is replaced whole, and an omission here
 * would silently remove a field the app reads.
 */
create or replace view visible_profiles
with (security_invoker = false) as
  select
    p.id,
    p.first_name,
    extract(year from age(p.birthdate))::int as age,
    p.gender,
    p.neighborhood,
    p.height_cm,
    p.occupation,
    /*
     * Approved only, still in display order.
     *
     * `jsonb_agg` returns null over an empty set rather than an empty array,
     * which would make `photos` null for somebody mid-review and break every
     * `Array.isArray` guard downstream — hence the coalesce.
     *
     * A missing `approved` key reads as false. The funnel has always written
     * one, but a row hand-edited without it should be invisible until somebody
     * looks, not visible because of an omission.
     */
    coalesce(
      (
        select jsonb_agg(photo order by (photo->>'order')::int)
        from jsonb_array_elements(p.photos) as photo
        where coalesce((photo->>'approved')::boolean, false)
      ),
      '[]'::jsonb
    ) as photos,
    p.prompts,
    p.voice_intro_path,
    p.interests
  from profiles p
  where can_view_profile(p.id);

comment on view visible_profiles is
  'The only way one member reads another. Never grant SELECT on profiles to a '
  'peer. Unapproved photos are filtered here, which is why the rule cannot be '
  'forgotten by a new caller.';

/**
 * The write half — spec §7.3's "photo re-review".
 *
 * One photo at a time, addressed by its storage path, because that is what a
 * reviewer is actually looking at when they decide. Rewriting the whole array
 * from the console would race with a member reordering their photos in the same
 * moment and silently undo one of them.
 */
create or replace function set_photo_approval(
  p_user_id uuid, p_path text, p_approved boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_photos jsonb;
  v_found boolean;
begin
  if not is_admin() then
    raise exception 'Only an admin can approve a photo'
      using errcode = 'insufficient_privilege';
  end if;

  select photos into v_photos from profiles where id = p_user_id;
  if v_photos is null then
    raise exception 'No such member' using errcode = 'no_data_found';
  end if;

  select exists (
    select 1 from jsonb_array_elements(v_photos) as photo
    where photo->>'path' = p_path
  ) into v_found;
  if not v_found then
    -- Raised rather than ignored: a path that is not on the profile means the
    -- console is looking at something stale, and silently succeeding would show
    -- the reviewer a decision that never landed.
    raise exception 'That photo is not on this profile' using errcode = 'no_data_found';
  end if;

  update profiles
     set photos = (
       select jsonb_agg(
         case when photo->>'path' = p_path
              then jsonb_set(photo, '{approved}', to_jsonb(p_approved))
              else photo end
         order by (photo->>'order')::int
       )
       from jsonb_array_elements(v_photos) as photo
     )
   where id = p_user_id;

  perform audit('set_photo_approval', 'profiles', p_user_id, jsonb_build_object(
    'path', p_path,
    'approved', p_approved
  ));
end;
$$;

revoke execute on function set_photo_approval(uuid, text, boolean) from public, anon;
grant execute on function set_photo_approval(uuid, text, boolean) to authenticated;

comment on function set_photo_approval(uuid, text, boolean) is
  'Admin-only. Flips one photo''s `approved` flag by path and audits it. The '
  'flag is what `visible_profiles` filters on, so this is the only thing that '
  'puts a photo in front of another member.';
