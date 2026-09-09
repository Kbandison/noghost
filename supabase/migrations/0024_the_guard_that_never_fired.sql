-- ============================================================================
-- 0024 — the guard 0022 added, which never fired once
-- ============================================================================
--
-- 0022 exists because a member could rewrite their own notifications: set
-- `sent_at` back to null and have the sweep deliver it again on demand, or
-- rename a moderator's warning so the warning screen stops matching it. It
-- added a trigger to stop that.
--
-- The trigger never ran a single check. `pnpm db:verify:notifications` says so
-- on the first run against the applied schema:
--
--   ✗ but cannot un-send it — that would be a re-send on demand
--       NO ERROR — sent_at was cleared
--   ✗ nor rewrite a moderator's warning out of existence   harmless
--   ✗ a member cannot prune the queue                      ALLOWED
--
-- One mistake, in three places. Every guard opened with a variant of:
--
--   if current_user is distinct from 'authenticated' ...
--
-- **Inside a `security definer` function, `current_user` is the function's
-- owner, not the caller.** It is `postgres` for every caller alive — a member,
-- the sweep, an admin — so `is distinct from 'authenticated'` was constantly
-- true and every guard returned before it checked anything. The comment above
-- it confidently explained that PostgREST sets the role from the key, which is
-- true of the *session* and irrelevant inside a definer function.
--
-- This is the same class of bug as the three units before it: a control that
-- exists, reads correctly, and does nothing. The difference is that this one
-- was mine, and it shipped with a verifier that would have caught it — the
-- verifier could not run, because the migration it tests was not applied yet.
--
-- `session_user` is not the fix either. Supabase connects as `authenticator`
-- and then `set role authenticated`, so `session_user` is `authenticator` and
-- the comparison fails the other way.
--
-- The fix does not ask about roles at all. `auth.uid()` reads the JWT, which
-- `security definer` does not touch:
--
--   a member       auth.uid() is their id, is_admin() false  → guarded
--   an admin       is_admin() true                           → passes
--   the sweep      service key, no user JWT, auth.uid() null → passes
--   direct SQL     no JWT at all, auth.uid() null            → passes
--
-- Idempotent: safe to re-run. Supersedes 0022's definitions of all three.

create or replace function notification_owner_may_only_mark_read()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  /*
   * A null `auth.uid()` means nobody is signed in as a member — the service
   * role, a cron, or a psql session. Those are the callers that legitimately
   * stamp `sent_at`, and they are exactly the ones with no JWT.
   */
  if (select auth.uid()) is null or is_admin() then
    return new;
  end if;

  if new.user_id    is distinct from old.user_id
     or new.channel     is distinct from old.channel
     or new.template    is distinct from old.template
     or new.payload     is distinct from old.payload
     or new.sent_at     is distinct from old.sent_at
     or new.skipped_at  is distinct from old.skipped_at
     or new.skip_reason is distinct from old.skip_reason
     or new.created_at  is distinct from old.created_at then
    raise exception 'A notification can be marked read. Nothing else about it is yours to change.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists notification_owner_may_only_mark_read on notifications;
create trigger notification_owner_may_only_mark_read
  before update on notifications
  for each row execute function notification_owner_may_only_mark_read();

comment on function notification_owner_may_only_mark_read() is
  'The notifications guard. `owner marks a notification read` permits any '
  'column; this narrows it to read_at. Gated on auth.uid() rather than on '
  'current_user, which inside a security definer function is the owner and so '
  'let every caller straight through (0024).';

create or replace function prune_notifications(p_days int default 90)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_removed int;
begin
  -- Signed in as a member and not an admin: refused. No JWT at all: this is
  -- the cron or a maintenance session, and it may prune.
  if (select auth.uid()) is not null and not is_admin() then
    raise exception 'Only an admin prunes notifications'
      using errcode = 'insufficient_privilege';
  end if;

  delete from notifications
   where (sent_at is not null or skipped_at is not null)
     and created_at < now() - make_interval(days => greatest(p_days, 1));
  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

revoke execute on function prune_notifications(int) from public, anon;

create or replace function prune_push_subscriptions(p_days int default 30)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_removed int;
begin
  if (select auth.uid()) is not null and not is_admin() then
    raise exception 'Only an admin prunes push subscriptions'
      using errcode = 'insufficient_privilege';
  end if;

  delete from push_subscriptions
   where expired_at is not null
     and expired_at < now() - make_interval(days => greatest(p_days, 1));
  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

revoke execute on function prune_push_subscriptions(int) from public, anon;

-- ---------------------------------------------------------------------------
-- And the shared browser, which 0022 got wrong in the other direction
-- ---------------------------------------------------------------------------
--
-- 0022 said the endpoint is the subscription's identity, so re-registering
-- moves it rather than duplicating it — "one browser, one person". The verifier
-- disagrees: the row stays with whoever registered first.
--
-- `owner manages own push subscriptions` is `using (auth.uid() = user_id)`, so
-- an upsert that resolves to an UPDATE of somebody else's row fails the USING
-- clause outright:
--
--   new row violates row-level security policy (USING expression) for table …
--
-- The second person therefore sees an error and simply cannot turn push on.
-- That much is a nuisance. The part that is not: a browser's push subscription
-- belongs to the browser, not to a session, so it outlives signing out — and
-- the first person's row stays live against a device somebody else is now
-- using. Their notifications keep arriving on it. That is one member's private
-- life on another member's lock screen, and it needs the row to actually change
-- hands rather than for the attempt to be refused.
--
-- Handing over the endpoint requires deleting a row the caller does not own, so
-- it goes through a definer function rather than a policy. The endpoint is a
-- long unguessable URL known only to the browser holding it and to us, and the
-- worst a leaked one buys is silencing that device's notifications — which is
-- strictly less bad than the leak above.

create or replace function register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in before registering a device'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(p_endpoint, '') = '' or coalesce(p_p256dh, '') = ''
     or coalesce(p_auth, '') = '' then
    raise exception 'That subscription is missing its endpoint or keys'
      using errcode = 'check_violation';
  end if;

  -- The handover. Deleting rather than reassigning so no field of the previous
  -- owner's row — their user agent, when they first registered — survives into
  -- somebody else's.
  delete from push_subscriptions where endpoint = p_endpoint and user_id <> v_uid;

  insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, expired_at)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 400), null)
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        -- Re-registering revives a subscription the sweep had retired.
        expired_at = null
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function register_push_subscription(text, text, text, text) from public, anon;
grant execute on function register_push_subscription(text, text, text, text) to authenticated;

comment on function register_push_subscription(text, text, text, text) is
  'Registers this browser against the caller. Takes the endpoint over from a '
  'previous owner, because a subscription left pointing at a browser somebody '
  'else now uses delivers one member''s notifications to another (0024).';
