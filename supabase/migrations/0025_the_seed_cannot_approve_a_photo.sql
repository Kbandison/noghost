-- ============================================================================
-- 0025 — the service role could not approve a photo either
-- ============================================================================
--
-- 0021 stops a member approving their own photo: the profiles trigger carries
-- `approved` over by path and forces false for a path that was not there
-- before. It works, and `pnpm db:verify:photos` proves it.
--
-- It also silently strips approval from the *service role*, which is not a
-- member and was never the target.
--
-- The clause is guarded by `is_admin() or … 'noghost.erasing'`, and `is_admin()`
-- reads `admin_users` for `auth.uid()`. A service-role client has no user JWT,
-- so `auth.uid()` is null, so `is_admin()` is false — the same shape of mistake
-- 0024 fixed in the notifications guard, arrived at from the other direction.
--
-- The visible symptom is the local environment. `db:seed:remote --applications`
-- writes `approved: true` for every seeded photo, above a comment explaining
-- that a fixture full of unapproved photos "renders as forty people with no
-- faces — which is correct behaviour and a useless local environment". The
-- trigger was turning them all back to false. Probed against this project:
--
--   Noor: 3 photo(s), approved = [false,false,false]
--   service-role update: no error
--   after:  approved = [false,false,false]
--
-- No error, which is why nobody noticed: the write succeeds and the value is
-- quietly replaced. Forty members, every one of them faceless, and the drop —
-- the screen the whole product is built around — showing "No photos on this
-- profile" for everybody.
--
-- Only the photo clause changes. The identity freeze and the status guard still
-- apply to the service role deliberately: those are invariants worth enforcing
-- against a buggy cron, not just against a member, and nothing legitimately
-- needs to write `first_name` or `status` directly. Photo approval is different
-- — `set_photo_approval` is the front door, and a fixture or a migration
-- writing an already-reviewed photo is a real thing to want.
--
-- Idempotent: safe to re-run. Supersedes 0021's definition of the same trigger;
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
   * The rule is "a member cannot approve their own photo", so it applies to a
   * member. A caller with no JWT at all — the service role, a cron, psql — is
   * not one, and carrying its writes over silently was turning every seeded
   * photo back to unapproved with no error to show for it.
   *
   * Narrow on purpose. The two clauses above still bind the service role,
   * because an accidental identity or status write is a bug worth catching
   * wherever it comes from; this one has a legitimate non-member caller.
   */
  if (select auth.uid()) is null then
    new.updated_at := now();
    return new;
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
  'The profiles guard. Identity freezes at admission and status is RPC-only, '
  'both enforced against every caller. Photo approval is carried over by path '
  'for signed-in members only — a keyless caller (the service role, a cron) is '
  'not the member this rule is about, and 0021 was silently unapproving its '
  'writes (0025).';
