-- ============================================================================
-- 0039 — say it without a refresh
-- ============================================================================
--
-- `supabase_realtime` has existed since the project was created and has never
-- had a table in it, so nothing in the product was live. A reply arrived and
-- sat there until the person it was for happened to reload — in a product whose
-- entire mechanic is a seven-day clock, "you had a message four hours ago"
-- is the wrong way to find out.
--
-- ---------------------------------------------------------------------------
-- Why this is safe to switch on
-- ---------------------------------------------------------------------------
--
-- Postgres Changes are delivered per subscriber and filtered by that
-- subscriber's own RLS SELECT policy, so adding a table here publishes exactly
-- what that table already lets each member read and nothing more:
--
--   messages   `is_chat_participant(chat_id)` — only the two people in a chat
--   profiles   `auth.uid() = id` — a member's own row, nobody else's
--
-- That second one is the whole reason `profiles` can be in here at all. Every
-- other member's profile reaches somebody through `visible_profiles`, which is
-- a view and is not published; the base table is readable only by its owner and
-- by an admin. So a member is told when their own profile changes, which is the
-- edit they are waiting to see, and is told nothing about anyone else's.
--
-- Both already have RLS enabled. A table published without it would broadcast
-- every row to every subscriber, which is the one mistake worth naming here.
-- ============================================================================

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.profiles;

/*
 * `replica identity full` on `profiles`, and deliberately not on `messages`.
 *
 * An UPDATE broadcast carries the old row only when the table has a full
 * replica identity; with the default it carries the primary key alone. RLS on
 * `profiles` is `auth.uid() = id`, so the key would be enough to authorize —
 * but a member editing their own row needs the change itself to be
 * distinguishable from any other row's, and the owner is the only recipient
 * either way.
 *
 * `messages` stays on the default: the subscription there is for INSERTs, which
 * always carry the new row, and a full replica identity on the highest-volume
 * table in the product would put every message body into the WAL twice.
 */
alter table public.profiles replica identity full;

comment on table public.messages is
  'Chat messages. Published to supabase_realtime since 0039 — delivery is filtered per subscriber by the "participants read messages" SELECT policy, so a member receives only the chats they are in.';
