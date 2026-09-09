-- ============================================================================
-- 0022 — notifications that can actually arrive, and cannot be rewritten
-- ============================================================================
--
-- `notifications` has existed since 0005 and every RPC and cron in the product
-- enqueues into it. Nothing has ever drained it. `sent_at` appears exactly once
-- in the whole codebase — in a TypeScript type — so every row ever queued is
-- still sitting there unsent, and the only notification a member has ever seen
-- is the moderator warning, which `lib/warnings.ts` reads by bypassing the
-- queue entirely.
--
-- Three things are missing before a sender can exist. All three are here.
--
-- ---------------------------------------------------------------------------
-- 1. Somewhere for a push to go
-- ---------------------------------------------------------------------------
--
-- 13 of §8's 17 templates are push, and push is the only channel in the matrix
-- that needs no third-party account: Web Push is a browser standard and VAPID
-- keys are self-generated. SMS and email stay blocked on Twilio and Resend, so
-- push is what turns the queue from a table into a delivery.
--
-- ---------------------------------------------------------------------------
-- 2. A way for a queue row to END
-- ---------------------------------------------------------------------------
--
-- A row today has exactly one terminal state: `sent_at`. That is not enough,
-- because some notifications must never be sent:
--
--   "48 hours left with Maya" delivered a day late is not a late notification,
--   it is a false one.
--
-- Without a second terminal state the sweep would have to choose between
-- stamping `sent_at` on something it did not send — which is the decorative
-- control this whole change exists to remove — and reconsidering the same dead
-- row on every run forever. `skipped_at` + `skip_reason` let a row end honestly
-- and say why.
--
-- ---------------------------------------------------------------------------
-- 3. Stopping a member from re-sending their own notifications
-- ---------------------------------------------------------------------------
--
-- `owner marks a notification read` allows any UPDATE on your own row:
--
--   using ((select auth.uid()) = user_id)
--
-- No column restriction. Probed against this project before writing this, and
-- both of these were ALLOWED for a signed-in member on their own rows:
--
--   set `sent_at` back to null  — the sweep picks it up and sends it again, on
--                                 demand, as many times as asked. Harmless-ish
--                                 with push; the day Twilio lands it is a free
--                                 SMS generator pointed at your own number.
--   rewrite `template`/`payload` — a warned member can rename a moderator's
--                                 warning so the warning screen never matches
--                                 it again, or edit the reason it states.
--
-- RLS already held on the two attempts that mattered less: another member's row
-- was untouched, and a `push` row was untouched because the SELECT policy is
-- `channel = 'inapp'` and the row could not be located.
--
-- The fix is 0021's shape — the row is yours, one field is not — but refused
-- rather than silently rewritten. 0021 carries values over because `approved`
-- lives inside a jsonb array the member is legitimately editing and a stale
-- echo is expected. Nothing here is like that: the only honest write this table
-- ever receives is `{read_at}`, so anything else is a bug or an attack, and
-- both are better loud.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- Push subscriptions
-- ---------------------------------------------------------------------------

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  /*
   * The endpoint IS the identity of a subscription — the browser hands back the
   * same URL when the same installation re-subscribes — so it is unique and
   * upserted on. Keying on (user_id, endpoint) instead would let one endpoint
   * accumulate rows across accounts on a shared device and push somebody
   * else's notification to it.
   */
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  /** For the member's own "which devices are these" list, nothing else. */
  user_agent text,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  /*
   * Set when the push service says the subscription is gone (404/410). Kept
   * rather than deleted so a sweep does not re-try it and the member can see
   * that a device stopped working, and pruned on a schedule.
   */
  expired_at timestamptz
);

create index if not exists push_subscriptions_user_idx
  on push_subscriptions (user_id) where expired_at is null;

alter table push_subscriptions enable row level security;

drop policy if exists "owner manages own push subscriptions" on push_subscriptions;
create policy "owner manages own push subscriptions"
  on push_subscriptions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table push_subscriptions is
  'Web Push endpoints, one per browser installation. The endpoint is the '
  'identity and is upserted on. Written by the member, read by the sweep as '
  'the service role.';

-- ---------------------------------------------------------------------------
-- A queue row can now end in two ways
-- ---------------------------------------------------------------------------

alter table notifications add column if not exists skipped_at timestamptz;
alter table notifications add column if not exists skip_reason text;

/*
 * The drain index. `notifications_unsent_idx` from 0005 only knows about
 * `sent_at`, so without this every sweep would re-scan every row it has already
 * decided never to send.
 */
create index if not exists notifications_undecided_idx
  on notifications (created_at) where sent_at is null and skipped_at is null;

comment on column notifications.skipped_at is
  'Set when the sweep decided this will never be sent. A row is pending while '
  'both this and sent_at are null; it is finished either way once one is set.';
comment on column notifications.skip_reason is
  'Why it will never send: stale, declined, no-transport, no-copy, unknown-template.';

-- ---------------------------------------------------------------------------
-- A member may mark it read. That is all.
-- ---------------------------------------------------------------------------

create or replace function notification_owner_may_only_mark_read()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  /*
   * Only members are restricted. PostgREST sets the role from the key, so the
   * sweep (service_role) and any direct SQL (postgres) pass straight through —
   * a trigger is NOT bypassed by RLS-bypassing keys, so without this the
   * sender could not stamp its own `sent_at`.
   */
  if current_user is distinct from 'authenticated' or is_admin() then
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
  'column; this narrows it to read_at, which is what stops a member setting '
  'sent_at back to null and re-sending their own notifications on demand.';

-- ---------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------

create or replace function prune_notifications(p_days int default 90)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_removed int;
begin
  if not is_admin() and current_user is not distinct from 'authenticated' then
    raise exception 'Only an admin prunes notifications'
      using errcode = 'insufficient_privilege';
  end if;

  -- Decided rows only. A pending row is never pruned however old it is: the
  -- sweep is what decides, and deleting its backlog would hide the fact that
  -- something has not been running.
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
  if not is_admin() and current_user is not distinct from 'authenticated' then
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
