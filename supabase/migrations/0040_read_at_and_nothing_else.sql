-- ============================================================================
-- 0040 — read_at, and nothing else
-- ============================================================================
--
-- `messages` has a policy called "recipient marks a message read":
--
--   using (is_chat_participant(chat_id) and sender_id is distinct from auth.uid())
--
-- The name describes an intention the grants never enforced. `authenticated`
-- holds UPDATE on *every column* of the table, and the policy's only conditions
-- are "you are in this chat" and "you did not send this" — so a member could
-- rewrite the body of any message sent to them, and the row would carry no sign
-- it had been touched.
--
-- In a product whose entire promise is that an ending is honest and an answer
-- is real, being able to edit what somebody said to you is close to the worst
-- possible write to leave open. §5's closing notes are messages.
--
-- Nothing has exercised it: `read_at` is null on every row in the database,
-- because no code has ever written it either. The policy and the column have
-- been sitting there since the chat flow was built, doing nothing, which is
-- also the reason nobody noticed the grant behind them.
--
-- ---------------------------------------------------------------------------
-- Revoking the table grant first is the whole trick
-- ---------------------------------------------------------------------------
--
-- A column-level REVOKE cannot narrow a table-level GRANT. 0006 tried exactly
-- that on `verifications` and the columns stayed readable for the life of the
-- project until 0030 found it. So this drops UPDATE on the table and grants it
-- back on one column.
-- ============================================================================

revoke update on public.messages from authenticated;
grant update (read_at) on public.messages to authenticated;

comment on column public.messages.read_at is
  'When the recipient opened the chat and saw this. Written only by them — 0040 narrows their UPDATE grant to this column alone, so the policy that lets a recipient touch a message they did not send cannot be used to rewrite what it says. Null until read; the Inbox badge counts conversations holding one.';
