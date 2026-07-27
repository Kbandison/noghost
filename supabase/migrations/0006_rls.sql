-- NoGhost — Row Level Security. Spec §5.
--
-- Every table below has RLS enabled with explicit policies. The publishable key
-- is public, so RLS is the only thing between the internet and this data
-- (BACKEND.md anti-pattern #2).
--
-- Two conventions throughout:
--   * `(select auth.uid())` rather than bare `auth.uid()`, so the function is
--     evaluated once per statement instead of once per row.
--   * No policy grants a client the ability to write a state column. Every
--     transition goes through an RPC in 0007 (spec §5, "non-negotiable pattern").

-- ============ HELPERS ============

create or replace function is_chat_participant(chat uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from chats c
    where c.id = chat and (select auth.uid()) in (c.user_a, c.user_b)
  );
$$;

create or replace function has_report_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from reports r
    where (r.reporter_id = a and r.reported_id = b)
       or (r.reporter_id = b and r.reported_id = a)
  );
$$;

/*
 * Whether the viewer is allowed to see a profile at all. Membership in the
 * same season is NOT sufficient — you can only see someone the mechanics have
 * actually introduced you to.
 */
create or replace function can_view_profile(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    case
      when (select auth.uid()) is null then false
      when (select auth.uid()) = target then true
      when has_report_between((select auth.uid()), target) then false
      else exists (
        -- on a drop that has actually been released to the viewer
        select 1
        from drop_cards dc
        join drops d on d.id = dc.drop_id
        where d.user_id = (select auth.uid())
          and d.released_at is not null
          and dc.shown_profile_id = target
      ) or exists (
        -- a connect in either direction
        select 1 from connects c
        where (c.from_user = (select auth.uid()) and c.to_user = target)
           or (c.to_user = (select auth.uid()) and c.from_user = target)
      ) or exists (
        -- an existing chat
        select 1 from chats ch
        where (ch.user_a = (select auth.uid()) and ch.user_b = target)
           or (ch.user_b = (select auth.uid()) and ch.user_a = target)
      )
    end;
$$;

/*
 * `visible_profiles` — spec §5: other members read profiles through this view,
 * never the raw table. Phone, birthdate, status and identity internals stop
 * here; age is derived so the date of birth never leaves the server.
 *
 * A view is definer-rights by default, so it reads `profiles` past that table's
 * RLS — which is exactly why its own WHERE clause carries the access rule.
 */
create view visible_profiles
with (security_invoker = false) as
  select
    p.id,
    p.first_name,
    extract(year from age(p.birthdate))::int as age,
    p.gender,
    p.neighborhood,
    p.height_cm,
    p.occupation,
    p.photos,
    p.prompts,
    p.voice_intro_path,
    p.interests
  from profiles p
  where can_view_profile(p.id);

comment on view visible_profiles is
  'The only way one member reads another. Never grant SELECT on profiles to a peer.';

-- ============ PROFILES ============

alter table profiles enable row level security;

create policy "owner reads own profile"
  on profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "owner creates own profile"
  on profiles for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "owner edits own profile"
  on profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "admins read all profiles"
  on profiles for select to authenticated
  using (is_admin());

/*
 * Identity fields freeze at admission (spec §5). A member can still change
 * photos, prompts and preferences; name, birthdate and gender need an admin.
 * `status` is excluded too — pausing and graduating go through RPCs.
 */
create or replace function freeze_identity_after_admission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() then
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

  -- Members never move their own status; `pause_account` and the graduation
  -- RPCs do, running as definer.
  new.status := old.status;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_freeze_identity
  before update on profiles
  for each row execute function freeze_identity_after_admission();

-- ============ VERIFICATIONS ============

alter table verifications enable row level security;

create policy "owner reads own verification"
  on verifications for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "owner submits own selfie"
  on verifications for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "admins manage verifications"
  on verifications for all to authenticated
  using (is_admin()) with check (is_admin());

-- RLS filters rows, not columns. The review notes are the reviewer's, so the
-- column grant is removed for everyone but the service role and admins.
revoke select (admin_notes) on verifications from authenticated;

-- ============ SEASONS ============

alter table seasons enable row level security;

create policy "members read seasons"
  on seasons for select to authenticated using (true);

create policy "admins manage seasons"
  on seasons for all to authenticated
  using (is_admin()) with check (is_admin());

-- ============ APPLICATIONS ============

alter table applications enable row level security;

create policy "owner reads own application"
  on applications for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "owner applies once"
  on applications for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'applied');

create policy "admins manage applications"
  on applications for all to authenticated
  using (is_admin()) with check (is_admin());

-- Internal-only, per spec §5. A rejected applicant never reads the reason.
revoke select (rejection_reason) on applications from authenticated;

-- No client UPDATE policy at all: status moves only via advance_application().

-- ============ SEASON MEMBERS ============

alter table season_members enable row level security;

create policy "owner reads own membership"
  on season_members for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "admins read memberships"
  on season_members for select to authenticated
  using (is_admin());

-- Insert is service-role only (the Stripe webhook). Service role bypasses RLS,
-- so the deliberate absence of an insert policy is the enforcement.

-- ============ DROPS ============

alter table drops enable row level security;
alter table drop_cards enable row level security;

create policy "owner reads own released drops"
  on drops for select to authenticated
  using ((select auth.uid()) = user_id and released_at is not null);

create policy "admins read drops"
  on drops for select to authenticated using (is_admin());

create policy "owner reads own released cards"
  on drop_cards for select to authenticated
  using (exists (
    select 1 from drops d
    where d.id = drop_cards.drop_id
      and d.user_id = (select auth.uid())
      and d.released_at is not null
  ));

/*
 * The only column a client may ever write directly, and only in one direction:
 * pending -> passed. A pass is silent and final, so there is nothing to
 * coordinate. pending -> connected goes through send_connect() instead, because
 * it has to create the connect row in the same transaction.
 */
create policy "owner passes on a card"
  on drop_cards for update to authenticated
  using (
    action = 'pending'
    and exists (
      select 1 from drops d
      where d.id = drop_cards.drop_id
        and d.user_id = (select auth.uid())
        and d.released_at is not null
    )
  )
  with check (action = 'passed');

create policy "admins read cards"
  on drop_cards for select to authenticated using (is_admin());

-- ============ CONNECTS ============

alter table connects enable row level security;

create policy "sender reads own sent connects"
  on connects for select to authenticated
  using ((select auth.uid()) = from_user);

create policy "recipient reads their inbox"
  on connects for select to authenticated
  using ((select auth.uid()) = to_user);

create policy "admins read connects"
  on connects for select to authenticated using (is_admin());

-- Insert via send_connect(), status change via respond_connect(). No client
-- write policies.

-- ============ CHATS ============

alter table chats enable row level security;

create policy "participants read their chats"
  on chats for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));

create policy "admins read chats"
  on chats for select to authenticated using (is_admin());

-- ============ MESSAGES ============

alter table messages enable row level security;

create policy "participants read messages"
  on messages for select to authenticated
  using (is_chat_participant(chat_id));

create policy "sender writes into an open chat"
  on messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and kind in ('text','voice')
    and exists (
      select 1 from chats c
      where c.id = messages.chat_id
        and (select auth.uid()) in (c.user_a, c.user_b)
        and c.state in ('active','date_scheduled','post_date_checkin')
    )
  );

-- Marking a message read is the only permitted update; no edits or deletes in v1.
create policy "recipient marks a message read"
  on messages for update to authenticated
  using (is_chat_participant(chat_id) and sender_id is distinct from (select auth.uid()))
  with check (is_chat_participant(chat_id));

create policy "admins read messages"
  on messages for select to authenticated using (is_admin());

-- ============ DATES & CHECK-INS ============

alter table dates enable row level security;

create policy "participants read dates"
  on dates for select to authenticated
  using (is_chat_participant(chat_id));

create policy "admins read dates"
  on dates for select to authenticated using (is_admin());

alter table date_checkins enable row level security;

/*
 * Own row only — the tightest policy in the schema. Spec §5: "partner NEVER
 * sees the other's raw answer, only the system outcome". The partner learns
 * the result through a closure note or a continuing chat, never from here.
 */
create policy "owner reads only their own check-in"
  on date_checkins for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "admins read check-ins"
  on date_checkins for select to authenticated using (is_admin());

-- ============ CLOSURE NOTES ============

alter table closure_notes enable row level security;

create policy "participants read a delivered note"
  on closure_notes for select to authenticated
  using (delivered_at is not null and is_chat_participant(chat_id));

create policy "admins read closure notes"
  on closure_notes for select to authenticated using (is_admin());

-- ============ GRADUATION & EXIT SURVEY ============

alter table graduations enable row level security;

create policy "participants read graduations"
  on graduations for select to authenticated
  using (is_chat_participant(chat_id));

alter table exit_surveys enable row level security;

create policy "owner reads own survey"
  on exit_surveys for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "owner answers own survey"
  on exit_surveys for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "owner updates own survey"
  on exit_surveys for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "admins read surveys"
  on exit_surveys for select to authenticated using (is_admin());

-- ============ REPORTS ============

alter table reports enable row level security;

create policy "reporter files a report"
  on reports for insert to authenticated
  with check ((select auth.uid()) = reporter_id);

create policy "reporter reads own reports"
  on reports for select to authenticated
  using ((select auth.uid()) = reporter_id);

create policy "admins manage reports"
  on reports for all to authenticated
  using (is_admin()) with check (is_admin());

-- ============ WAITLIST ============

alter table waitlist enable row level security;

create policy "admins read the waitlist"
  on waitlist for select to authenticated using (is_admin());

-- Anonymous sign-ups arrive through a rate-limited server action running as
-- service role (spec §5). No anon insert policy: an open endpoint here would be
-- a free spam target on a public marketing page.

-- ============ NOTIFICATIONS ============

alter table notifications enable row level security;

create policy "owner reads own in-app notifications"
  on notifications for select to authenticated
  using ((select auth.uid()) = user_id and channel = 'inapp');

create policy "owner marks a notification read"
  on notifications for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table notification_prefs enable row level security;

create policy "owner manages own prefs"
  on notification_prefs for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============ ADMIN AUDIT ============

alter table admin_audit enable row level security;

create policy "admins read the audit trail"
  on admin_audit for select to authenticated using (is_admin());

-- Append-only: written by the audit() helper running as definer. No client
-- insert, update or delete policy exists, so the trail cannot be rewritten.

alter table processed_webhook_events enable row level security;
-- Service role only. No policies at all.

-- ============ DATA API GRANTS ============
-- Post-October-2026, new tables are invisible to supabase-js until granted
-- (BACKEND.md). Grants control API visibility; RLS controls row access. Both
-- are required, so a missing grant reads as "the query returns nothing".

grant usage on schema public to anon, authenticated;

grant select, insert, update on
  profiles, verifications, applications, exit_surveys, notification_prefs
  to authenticated;

grant select on
  seasons, season_members, drops, connects, chats, dates, date_checkins,
  closure_notes, graduations, notifications
  to authenticated;

grant select, update on drop_cards to authenticated;
grant select, insert on messages to authenticated;
grant update on messages to authenticated;
grant select, insert on reports to authenticated;

-- The marketing site is anonymous and only ever needs the seat counter.
grant select on public_season_stats to anon, authenticated;
grant select on visible_profiles to authenticated;

-- Re-apply the column revocations after the table-level grants above.
revoke select (admin_notes) on verifications from authenticated;
revoke select (rejection_reason) on applications from authenticated;
