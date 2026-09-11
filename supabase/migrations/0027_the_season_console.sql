-- ============================================================================
-- 0027 — the season console
-- ============================================================================
--
-- §7.3: "Edit all `seasons` config, phase transitions (with confirm gates),
-- season calendar, seats-remaining override for marketing site."
--
-- `admins manage seasons` already permits the writes, so this is not about
-- permission — it is about the audit trail. §7.3 also says every mutation lands
-- in `admin_audit`, and `audit()` is not granted to `authenticated`, so a
-- direct UPDATE from the console would change a season's price with nothing
-- recording who did it. These RPCs are the same shape as `resolve_report` and
-- `broadcast_to_season`: check `is_admin()`, do the work, write the trail.
--
-- Phase gets its own function rather than being one more column on the editor.
-- Publishing a draft or closing a season early is a different kind of act from
-- correcting a typo in a name, it is the thing §7.3 wants a confirm gate on,
-- and a separate `audit` action makes it findable in the trail six months later
-- without reading every diff.
--
-- ---------------------------------------------------------------------------
-- On the "seats-remaining override"
-- ---------------------------------------------------------------------------
--
-- Implemented as a cap that can only ever lower the number shown, never raise
-- it, and the constraint below enforces that at the database.
--
-- The honest use is holding inventory back — releasing a cohort in waves, where
-- the withheld seats genuinely are not available yet. The dishonest use is
-- showing "7 left" when there are ninety, which is manufactured scarcity on the
-- front page of a dating product: §3.3 bans manufactured urgency outright and
-- §12 lists engagement bait under "Never". A field that can only subtract
-- cannot be used to inflate demand, and a season that wants a smaller cohort
-- already has `member_cap` for that.
--
-- Idempotent: safe to re-run.

alter table seasons add column if not exists seats_display_cap int;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'seasons_seats_display_cap_check'
  ) then
    alter table seasons add constraint seasons_seats_display_cap_check
      check (seats_display_cap is null or seats_display_cap >= 0);
  end if;
end $$;

comment on column seasons.seats_display_cap is
  'Caps the seats_remaining the marketing site shows. Lowers only — never '
  'raises, so it cannot manufacture scarcity (§3.3). Null means show the truth.';

/*
 * `create or replace view` carries every column forward; the only change is
 * `least(...)` around the existing expression. An omission here would silently
 * drop a field the marketing site reads.
 */
create or replace view public_season_stats
with (security_invoker = false) as
  select
    s.id,
    s.name,
    s.city,
    s.phase,
    s.starts_at,
    s.ends_at,
    s.member_cap,
    s.claim_hours,
    s.applications_open_at,
    s.price_early_cents,
    s.price_standard_cents,
    s.early_bird_cap,
    s.timezone,
    least(
      greatest(s.member_cap - (
        select count(*) from season_members m where m.season_id = s.id
      ), 0),
      coalesce(s.seats_display_cap, 2147483647)
    )::int as seats_remaining
  from seasons s
  where s.phase in ('applications_open','pre_season','live','finale_week');

create or replace function update_season(
  p_season_id uuid,
  p_name text default null,
  p_city text default null,
  p_applications_open_at timestamptz default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_member_cap int default null,
  p_drop_time time default null,
  p_drop_max int default null,
  p_fuse_days int default null,
  p_claim_hours int default null,
  p_price_early_cents int default null,
  p_price_standard_cents int default null,
  p_early_bird_cap int default null,
  p_encore_start_week int default null,
  p_timezone text default null,
  p_seats_display_cap int default null,
  p_clear_seats_cap boolean default false
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_before seasons;
  v_after seasons;
  v_changed jsonb := '{}'::jsonb;
begin
  if not is_admin() then
    raise exception 'Only an admin can edit a season'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_before from seasons where id = p_season_id;
  if v_before.id is null then
    raise exception 'No such season' using errcode = 'no_data_found';
  end if;

  /*
   * Null means "leave it alone", which is why every parameter defaults to null
   * and the caller sends only what changed. `seats_display_cap` needs a
   * separate flag because null is also its legitimate value — "show the truth"
   * is a setting, not an absence.
   */
  update seasons set
    name                 = coalesce(p_name, name),
    city                 = coalesce(p_city, city),
    applications_open_at = coalesce(p_applications_open_at, applications_open_at),
    starts_at            = coalesce(p_starts_at, starts_at),
    ends_at              = coalesce(p_ends_at, ends_at),
    member_cap           = coalesce(p_member_cap, member_cap),
    drop_time            = coalesce(p_drop_time, drop_time),
    drop_max             = coalesce(p_drop_max, drop_max),
    fuse_days            = coalesce(p_fuse_days, fuse_days),
    claim_hours          = coalesce(p_claim_hours, claim_hours),
    price_early_cents    = coalesce(p_price_early_cents, price_early_cents),
    price_standard_cents = coalesce(p_price_standard_cents, price_standard_cents),
    early_bird_cap       = coalesce(p_early_bird_cap, early_bird_cap),
    encore_start_week    = coalesce(p_encore_start_week, encore_start_week),
    timezone             = coalesce(p_timezone, timezone),
    seats_display_cap    = case when p_clear_seats_cap then null
                                else coalesce(p_seats_display_cap, seats_display_cap) end
  where id = p_season_id
  returning * into v_after;

  /*
   * Only what actually changed, old and new. A trail that recorded the whole
   * row on every save would bury the one field somebody altered, and the
   * question being asked of this table later is always "who changed the price".
   */
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_changed
  from (
    select key, jsonb_build_object('from', before_value, 'to', after_value) as value
    from (
      select
        b.key,
        b.value as before_value,
        a.value as after_value
      from jsonb_each(to_jsonb(v_before)) b
      join jsonb_each(to_jsonb(v_after)) a using (key)
      where b.value is distinct from a.value
    ) diff
  ) changed;

  if v_changed = '{}'::jsonb then
    return;
  end if;

  perform audit('update_season', 'seasons', p_season_id, v_changed);
end;
$$;

revoke execute on function update_season(
  uuid, text, text, timestamptz, timestamptz, timestamptz, int, time, int, int,
  int, int, int, int, int, text, int, boolean
) from public, anon;
grant execute on function update_season(
  uuid, text, text, timestamptz, timestamptz, timestamptz, int, time, int, int,
  int, int, int, int, int, text, int, boolean
) to authenticated;

comment on function update_season(
  uuid, text, text, timestamptz, timestamptz, timestamptz, int, time, int, int,
  int, int, int, int, int, text, int, boolean
) is
  'Admin-only season editor. Null means leave alone; audits only the fields '
  'that actually changed, old and new. Phase is deliberately NOT here — see '
  'set_season_phase.';

create or replace function set_season_phase(
  p_season_id uuid,
  p_phase season_phase,
  p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_before season_phase;
begin
  if not is_admin() then
    raise exception 'Only an admin can change a season phase'
      using errcode = 'insufficient_privilege';
  end if;

  select phase into v_before from seasons where id = p_season_id;
  if v_before is null then
    raise exception 'No such season' using errcode = 'no_data_found';
  end if;

  if v_before = p_phase then
    return;
  end if;

  update seasons set phase = p_phase where id = p_season_id;

  /*
   * The reason is recorded because this is the one season write that changes
   * what members experience rather than what they are charged — closing a
   * season early ends every open conversation at the next fuse sweep. A
   * timestamp and a name do not explain that to whoever reads the trail later.
   */
  perform audit('set_season_phase', 'seasons', p_season_id, jsonb_build_object(
    'from', v_before,
    'to', p_phase,
    'reason', p_reason
  ));
end;
$$;

revoke execute on function set_season_phase(uuid, season_phase, text) from public, anon;
grant execute on function set_season_phase(uuid, season_phase, text) to authenticated;

comment on function set_season_phase(uuid, season_phase, text) is
  'Admin-only, audited with a reason. Separate from update_season because '
  'publishing a draft or closing a season early is a different kind of act '
  'from fixing a typo, and §7.3 wants a confirm gate on it.';
