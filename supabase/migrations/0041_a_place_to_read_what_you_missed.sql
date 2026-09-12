-- ============================================================================
-- 0041 — a place to read what you missed
-- ============================================================================
--
-- `notifications` has been readable by its owner only when
-- `channel = 'inapp'`, and there is not one `inapp` row in the database. Every
-- notification this product has ever produced went out as push, email or SMS —
-- so a member could read, by policy, exactly nothing.
--
-- That was consistent with a decision recorded while `notification-sweep` was
-- built: no in-app notification centre, because §8's three `inapp` templates
-- already surface in context — `connect_declined` in the inbox,
-- `chat_closed_fuse` and `closure_received` as system messages in the
-- conversation — and a centre would duplicate them and want the kind of badge
-- §3.3's engagement-bait ban exists to prevent.
--
-- **That decision is reversed here, deliberately, and the reason is push.** A
-- push notification is the one message this product sends that a member can
-- lose: dismissed from a lock screen, arriving while the phone is face-down,
-- swiped by somebody clearing a shade. Every other channel leaves a copy — SMS
-- in their messages, email in their inbox — and push leaves none. "Last day
-- with Maya" vanishing unread is the exact failure the fuse exists to prevent.
--
-- So the centre is not a second inbox. It is the record of what was sent, which
-- is the thing push does not keep.
--
-- ---------------------------------------------------------------------------
-- Sent only — never the queue, never the skip reasons
-- ---------------------------------------------------------------------------
--
-- A row carries `skipped_at` and `skip_reason`, and those reasons are internal:
-- "no-copy" means a template we have not written, "bad-address" means their
-- email bounced. Neither is a sentence to put in front of somebody, and a queued
-- row is a promise not yet kept.
--
-- The `inapp` clause stays alongside so nothing that reads this today changes
-- behaviour if such a row ever appears.
-- ============================================================================

drop policy if exists "owner reads own in-app notifications" on public.notifications;

create policy "owner reads what was sent to them"
  on public.notifications
  for select
  using (
    (select auth.uid()) = user_id
    and (channel = 'inapp'::notif_channel or sent_at is not null)
  );

comment on table public.notifications is
  'Every message this product sends a member, one row per channel. Readable by its owner once it has actually been sent (0041) — the queue and the skip reasons stay internal. UPDATE is permitted by policy but narrowed to read_at by the notification_owner_may_only_mark_read trigger (0024), not by a column grant.';
