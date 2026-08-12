-- ============================================================================
-- 0013 — one graduation ask per person per chat
-- ============================================================================
--
-- §6.5: "Declining a graduation proposal is allowed and private; chat simply
-- continues."
--
-- `propose_graduation` was a bare insert, so nothing stopped the same member
-- asking twice. Two consequences, and the second one is the serious one:
--
--   1. Two open rows for one chat. The read layer took `.maybeSingle()` on the
--      pending proposal, which throws when a double-submitted click leaves two.
--
--   2. A re-ask defeats the privacy rule. The app hides the "Found someone?"
--      button while a proposal is open, so if asking again were possible the
--      button would disappear on asking and *come back* on being declined —
--      and its reappearance is the notification §6.5 says must not happen.
--      Fixed in the read layer too (an ask is spent whatever its status), but
--      the rule belongs in the database as well: the UI is where it is
--      pleasant, and this is where it is true.
--
-- Both people asking at once is a different case and stays legal. It is two
-- rows by two different proposers, both meaning yes, and either one can be
-- confirmed — refusing the second would turn mutual enthusiasm into an error.
--
-- The partial unique index does the work. Partial rather than total because
-- `declined` rows must be allowed to accumulate for the audit trail without
-- blocking anything, and because a *confirmed* graduation already ends the
-- season. `where status = 'proposed'` is also exactly what the app queries.
--
-- Idempotent: safe to re-run.

create unique index if not exists graduations_one_open_ask_idx
  on graduations (chat_id, proposed_by)
  where status = 'proposed';

/*
 * Returns the existing ask instead of raising on a second attempt.
 *
 * A double-submitted form is not a member doing anything wrong, and the caller
 * wants the same thing it wanted the first time. Re-asking after a *decline*
 * is refused instead — silently returning the declined row's id would hand the
 * proposer the one fact §6.5 keeps from them.
 */
create or replace function propose_graduation(p_chat_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if not is_chat_participant(p_chat_id) then
    raise exception 'Not your chat' using errcode = 'insufficient_privilege';
  end if;

  select id into v_id
    from graduations
   where chat_id = p_chat_id and proposed_by = v_uid and status = 'proposed';
  if v_id is not null then
    return v_id;
  end if;

  /*
   * Deliberately the same message whether they were declined or the season
   * already ended. The proposer learns that their one ask is used up, which
   * they already knew, and nothing about the answer.
   */
  if exists (
    select 1 from graduations
     where chat_id = p_chat_id and proposed_by = v_uid
  ) then
    raise exception 'You have already asked in this chat'
      using errcode = 'unique_violation';
  end if;

  insert into graduations (chat_id, proposed_by) values (p_chat_id, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

comment on function propose_graduation(uuid) is
  'One ask per member per chat (§6.5). A repeat of an open ask returns it; a '
  'repeat after an answer is refused, because a re-ask that suddenly worked '
  'again would tell the proposer they had been declined.';
