-- ============================================================================
-- 0026 — an address to send receipts to
-- ============================================================================
--
-- §8 routes four templates to email — `application_received`, `admitted_claim`,
-- `season_start`, `season_finale` — and §9.5 writes all four in full. §7.4 says
-- plainly: "Email captured at application for receipts/comms."
--
-- It never was. `profiles` has no email column and the funnel never asks;
-- `signInWithOtp({ phone })` mints a phone-only account. Every address in this
-- database belongs to a seed fixture or to an admin. So the email channel has
-- had, from the beginning, nowhere to send to — a matrix row describing a
-- delivery that could not be addressed.
--
-- Nullable, and it has to be. Every member admitted before this exists without
-- one, and a `not null` column would either refuse them or invent a value.
-- `notification-sweep` skips a row it cannot address and says so, which is the
-- honest shape: the ones who have an address get their receipt, the ones who
-- do not are visible as `no-address` rather than silently dropped.
--
-- `citext` because nobody types their own address the same way twice, and
-- unique because two accounts sharing one inbox is how a receipt reaches the
-- wrong person. Not a foreign key to `auth.users.email`: that column is the
-- admin credential for admins and null for members, and coupling the two would
-- mean changing a sign-in address to fix a typo in a receipt.
--
-- Idempotent: safe to re-run.

alter table profiles add column if not exists email citext;

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'profiles_email_key'
  ) then
    create unique index profiles_email_key on profiles (email) where email is not null;
  end if;
end $$;

comment on column profiles.email is
  'Where receipts and lifecycle mail go (§7.4, §9.5). Nullable: members admitted '
  'before 0026 have none, and notification-sweep skips those with `no-address` '
  'rather than pretending. Never a sign-in credential — the phone is that.';
