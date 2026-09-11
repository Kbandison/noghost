-- ============================================================================
-- 0036 — eighteen, and no city in the name
-- ============================================================================
--
-- Two product decisions, both of which the database was enforcing a stale
-- version of.
--
-- ---------------------------------------------------------------------------
-- The age floor
-- ---------------------------------------------------------------------------
--
-- `profiles.age_min` has been `not null default 21 check (age_min >= 21)` since
-- 0002. 21 was a Season One curation choice rather than a legal minimum — §12
-- lists opening it to 18–20 as a Season Two decision — and that has been brought
-- forward.
--
-- The check is the part that matters. `MIN_AGE` moving to 18 in config without
-- this would produce a funnel that offers 18 in its slider and a database that
-- refuses the row, which is the worst of both: a promise made on screen and
-- broken on submit, for the youngest applicants only.
--
-- Existing rows are unaffected — every current `age_min` is 21 or higher, and
-- loosening a check never invalidates what already passed it.
--
-- ---------------------------------------------------------------------------
-- The season's name
-- ---------------------------------------------------------------------------
--
-- "Atlanta Season One" appears on the application, in every email §9.5 renders,
-- and on the review screen. A season named after a city reads as a local
-- product — and since 0028 replaced the neighborhood clusters with coordinates,
-- opening the next city is a row of applicants rather than a release.
--
-- `seasons.city` stays, and stays Atlanta. It is how the per-city model works,
-- it drives the admin console, and it is true. What changed is that it stopped
-- being part of anything a member reads.
-- ============================================================================

alter table public.profiles
  drop constraint if exists profiles_age_min_check;
alter table public.profiles
  add constraint profiles_age_min_check check (age_min >= 18);

alter table public.profiles
  alter column age_min set default 18;

comment on column public.profiles.age_min is
  'Youngest they want to be shown. Floor is 18 (0036, down from 21) and must stay in step with MIN_AGE in packages/config — the funnel offers what this accepts.';

update public.seasons
   set name = 'Season One'
 where name = 'Atlanta Season One';
