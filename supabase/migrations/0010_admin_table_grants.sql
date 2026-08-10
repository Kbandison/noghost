-- ============================================================================
-- 0010 — explicit Data API grants for the two admin tables
-- ============================================================================
--
-- `0006_rls.sql` grants SELECT table by table and explains why: post-October-
-- 2026, a table with no grant is invisible to supabase-js, and a missing grant
-- reads exactly like an empty table. Its grant block covers the member-facing
-- schema but never named `admin_users` or `admin_audit`, so both have been
-- riding on Supabase's stock default privileges for the `public` schema.
--
-- That is a live dependency, not a theoretical one, and the failure is quiet in
-- the worst way. `adminGate()` decides whether you are an admin by *reading*
-- your own `admin_users` row — deliberately, so it cannot drift from what RLS
-- will permit elsewhere. Lose the grant and that read returns zero rows rather
-- than an error, which the gate reads as "not an admin". Every admin is locked
-- out of the console at once, and the console reports it as a permissions
-- decision rather than a missing grant.
--
-- RLS is unchanged and still does the real work: `admins read the allow-list`
-- and `admins read the audit trail` are both `using (is_admin())`, so a
-- signed-in non-admin sees zero rows from either table. Verified against the
-- live project — a throwaway member gets no error and no rows.
--
-- Idempotent: safe to re-run.

grant select on admin_users, admin_audit to authenticated;

-- Not to `anon`. Neither table has a policy that would return rows to an
-- anonymous caller, but there is no reason for either to appear on the public
-- API surface at all.
revoke all on admin_users, admin_audit from anon;

-- Append-only stays append-only. The trail is written by security-definer
-- functions running as the owner, so no client needs to write it, and no
-- policy exists that would let one.
revoke insert, update, delete on admin_audit from authenticated;
