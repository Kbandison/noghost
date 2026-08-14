-- ============================================================================
-- 0021 — a member cannot approve their own photo
-- ============================================================================
--
-- 0020 made `visible_profiles` filter on `photos[].approved`, which turned that
-- flag into the thing standing between an unreviewed image and every card in
-- the product. It did not make the flag hard to write.
--
-- `owner edits own profile` permits any UPDATE on your own row, and `photos` is
-- one jsonb column with no column-level restriction — so a member can PATCH
-- their profile with `[{"path": …, "order": 0, "approved": true}]` and put
-- whatever they like straight onto their card. The review queue would sit empty
-- and look correct. That is a worse position than before 0020, because now
-- there is a control that appears to be working.
--
-- The fix is the same shape as the identity freeze next to it: the member may
-- change everything about their photos except the one field that is not theirs.
-- Add, remove, reorder — the flag comes from whatever it already was, and a
-- path that was not there before starts at false.
--
-- Column-level `revoke update (photos)` was the alternative and is rejected for
-- the reason 0012 gives about `status`: it requires enumerating every other
-- column of `profiles` in a GRANT, and adding a column later without
-- remembering breaks profile editing with no warning.
--
-- Admins and erasure keep their existing doors — `set_photo_approval` runs as
-- an admin, and `delete_own_account` blanks the array entirely.
--
-- Idempotent: safe to re-run. Supersedes 0018's definition of the same trigger;
-- every earlier clause is carried forward unchanged.

create or replace function freeze_identity_after_admission()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_approved jsonb;
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

  /*
   * Rewritten rather than refused, and that is deliberate.
   *
   * Raising here would mean a member reordering their photos gets an error
   * whenever the client happens to echo back a stale `approved` — which it will,
   * because the flag is part of the same array they are legitimately editing.
   * Silently forcing the correct value lets every honest edit through and makes
   * the dishonest one a no-op, which is what this rule is for.
   *
   * The old flag is looked up by path, so reordering carries approval with the
   * photo rather than with its position.
   */
  select jsonb_agg(
           jsonb_set(
             photo,
             '{approved}',
             to_jsonb(coalesce(
               (
                 select (was->>'approved')::boolean
                 from jsonb_array_elements(coalesce(old.photos, '[]'::jsonb)) as was
                 where was->>'path' = photo->>'path'
                 limit 1
               ),
               false
             ))
           )
           order by (photo->>'order')::int
         )
    into v_approved
  from jsonb_array_elements(coalesce(new.photos, '[]'::jsonb)) as photo;

  new.photos := coalesce(v_approved, '[]'::jsonb);

  new.updated_at := now();
  return new;
end;
$$;

comment on function freeze_identity_after_admission() is
  'The profiles guard. Identity freezes at admission; status is RPC-only; and '
  'photo approval is carried over by path, so a member can add, remove and '
  'reorder their photos but never approve one — which is what '
  'visible_profiles filters on.';
