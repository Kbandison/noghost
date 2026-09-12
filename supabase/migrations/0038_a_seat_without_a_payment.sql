-- ============================================================================
-- 0038 — a seat without a payment
-- ============================================================================
--
-- `season_members` is the row that makes somebody a member: `memberGate` reads
-- it, and an admitted application is a promise of a seat rather than a seat.
-- Until now exactly one thing in the entire system could write that row — the
-- Stripe webhook.
--
-- So with Stripe unconfigured there is no path from "admitted" to "member" at
-- all. The review screen says "Payments aren't switched on for this deployment
-- yet, so there's nothing to click. Your seat is still held", which is true and
-- is also a dead end: the seat is held forever and the door never opens.
--
-- That needed fixing regardless of Stripe. Comped seats are an ordinary part of
-- running this thing — founders, the review team, press, and the support case
-- where somebody's card failed three times and they are plainly in. A product
-- whose only route to membership is a successful Stripe webhook cannot do any
-- of that.
--
-- ---------------------------------------------------------------------------
-- Why not "payments off means everyone gets in free"
-- ---------------------------------------------------------------------------
--
-- Because that is a live site with applications open and auto-admit on, and it
-- would mean every admitted applicant could take a free seat the moment a
-- Stripe key went missing — including by someone deleting one. A deployment
-- with no payment keys would silently become a free product.
--
-- A comp is therefore an explicit act by a named admin with a stated reason,
-- never a fallback the absence of configuration turns on.
--
-- ---------------------------------------------------------------------------
-- The constraint is the point
-- ---------------------------------------------------------------------------
--
-- `stripe_payment_intent` becomes nullable, which on its own would allow a
-- member row with no payment AND no comp — a seat from nowhere, which is the
-- thing this table exists to make impossible. So exactly one of the two has to
-- be present, enforced in the schema rather than by whoever writes the insert.
-- ============================================================================

/*
 * `comped_by` carries no foreign key, on purpose, and the first draft of this
 * migration got it wrong twice over.
 *
 * It pointed at `profiles(id)`, which is the member table — and an admin is not
 * a member. `admin_users` references `auth.users` and nothing requires a
 * reviewer to have walked the funnel, so the very first real comp failed with a
 * foreign key violation.
 *
 * Pointing it at `auth.users` instead would work and would still be wrong.
 * `admin_users.id` cascades on delete, so an FK here would either cascade a
 * member's SEAT out of existence because an employee left, or block removing
 * that employee for as long as the season exists. `admin_audit.admin_id` has no
 * FK for exactly this reason: a record of who did something has to outlive the
 * person who did it.
 */
alter table public.season_members
  alter column stripe_payment_intent drop not null,
  add column if not exists comped_by uuid,
  add column if not exists comp_reason text;

comment on column public.season_members.comped_by is
  'auth.uid() of the admin who granted this seat without payment. Deliberately no foreign key — admins are not profiles, and admin_users cascades on delete, so an FK would either erase a member''s seat when an employee is removed or prevent removing them. Mutually exclusive with stripe_payment_intent — see season_members_paid_or_comped.';

comment on column public.season_members.comp_reason is
  'Why the seat was comped, required and free text. Stored because "why is this member not in the revenue figures" needs an answer that outlives the person who knew.';

/*
 * Exactly one, never neither and never both.
 *
 * Neither would be a seat nobody paid for and nobody granted. Both would make
 * "was this seat sold" unanswerable, which is the question the finance side of
 * a season rests on.
 */
alter table public.season_members
  drop constraint if exists season_members_paid_or_comped;

alter table public.season_members
  add constraint season_members_paid_or_comped check (
    (stripe_payment_intent is not null and comped_by is null)
    or (stripe_payment_intent is null and comped_by is not null and comp_reason is not null)
  );

-- ============================================================================
-- Granting one
-- ============================================================================

create or replace function public.comp_seat(p_application_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_app applications;
  v_uid uuid := (select auth.uid());
  v_reason text := nullif(btrim(p_reason), '');
begin
  /*
   * Admin only, and authorized on `auth.uid()` rather than `current_user`.
   *
   * Inside a SECURITY DEFINER function `current_user` is the function's owner,
   * so a `current_user` check here would pass for everybody who can execute it.
   * This project has shipped that hole once already.
   */
  if not is_admin() then
    raise exception 'Only an admin can comp a seat'
      using errcode = 'insufficient_privilege';
  end if;

  if v_reason is null then
    raise exception 'A comped seat needs a reason';
  end if;

  select * into v_app from applications where id = p_application_id;
  if not found then
    raise exception 'No such application';
  end if;

  /*
   * Already holding a seat? Nothing to do, and say nothing about it.
   *
   * This check has to come BEFORE the status check, and the first draft had it
   * after — which made the whole function non-idempotent in the one way that
   * matters. Granting a seat advances the application to `claimed`, so a second
   * call fell into the status guard below and raised "Only an admitted
   * application can be comped — this one is claimed". A double-click on the
   * console button produced an error message accusing the reviewer of
   * something they had just successfully done.
   *
   * Caught by `db:verify:admission-route`, which asserted the idempotence this
   * function's own comment claimed.
   */
  if exists (
    select 1 from season_members
     where user_id = v_app.user_id and season_id = v_app.season_id
  ) then
    return;
  end if;

  /*
   * Only from `admitted`. A comp is a way to take a seat that has been offered,
   * not a way around being offered one — going straight from `under_review`
   * would skip the decision entirely, and from `rejected` would reverse it
   * silently. `advance_application` would refuse the transition anyway; this
   * says so with a message a person can act on.
   */
  if v_app.status <> 'admitted' then
    raise exception 'Only an admitted application can be comped — this one is %', v_app.status;
  end if;

  insert into season_members (
    user_id, season_id, stripe_payment_intent, price_paid_cents, comped_by, comp_reason
  )
  values (v_app.user_id, v_app.season_id, null, 0, v_uid, v_reason)
  -- Belt and braces alongside the early return above: this closes the window
  -- between the two, where a Stripe webhook landing mid-call would otherwise
  -- turn a race into a unique-violation the reviewer sees as a crash.
  on conflict (user_id, season_id) do nothing;

  /*
   * The application follows the seat, exactly as it follows the money in the
   * Stripe webhook. Without this the claim sweep still sees an `admitted`
   * application past its deadline and expires a seat the member is holding.
   */
  if v_app.status = 'admitted' then
    perform advance_application(p_application_id, 'claimed');
  end if;

  /*
   * A second audit row on top of `advance_application`'s own, because "who
   * admitted this person" and "who decided they would not pay" are different
   * questions and the second one is the one a spreadsheet will ask.
   *
   * An admin comping their OWN seat is allowed, deliberately. 0036 forbids
   * approving your own photos because that defeats a safety control protecting
   * other members; comping your own seat costs the business money and endangers
   * nobody, and the founder needing a seat is the first real use of this. The
   * proportionate control is that the audit row names them, not a prohibition
   * that would block the actual case.
   */
  perform audit(
    'comp_seat',
    'season_members',
    p_application_id,
    jsonb_build_object('reason', v_reason, 'self', v_uid = v_app.user_id)
  );
end;
$$;

revoke all on function public.comp_seat(uuid, text) from public, anon, authenticated;
grant execute on function public.comp_seat(uuid, text) to authenticated, service_role;

comment on function public.comp_seat(uuid, text) is
  'Grants an admitted applicant their seat with no payment: writes season_members with price_paid_cents 0 and a named admin, then advances the application to claimed so the claim sweep does not expire it. Admin-only, enforced on auth.uid(). Requires a reason. Idempotent. An admin may comp their own seat — the audit row records that it was self-granted.';
