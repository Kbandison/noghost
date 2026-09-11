-- ============================================================================
-- 0028 — geography instead of Atlanta
-- ============================================================================
--
-- The app was built for Atlanta. `profiles.neighborhood` was an enum of nine
-- intown areas, and `drop.ts` scored proximity by asking whether two people's
-- neighborhoods fell in the same hand-drawn cluster. That works for exactly one
-- city and then stops: the second city needs a second list, a second cluster
-- map, and a code change to launch. A coordinate needs none of that.
--
-- So: a rounded point and a distance somebody is willing to travel. Season one
-- still runs in Atlanta — nothing here changes that — but the thing deciding
-- who is near whom is now arithmetic rather than a list of place names, and the
-- next city is a row of applicants rather than a release.
--
-- ---------------------------------------------------------------------------
-- Why three decimal places
-- ---------------------------------------------------------------------------
--
-- numeric(6,3) and numeric(7,3) are the point of this migration, not an
-- incidental storage choice. Three decimals is about 110 metres at the equator
-- and less as you go north — enough to sort a city into neighbourhoods, not
-- enough to identify a building. The precision is discarded in the browser
-- before the value is ever sent (see `roundForStorage`), and the column type
-- means a future writer who forgets cannot store more than we promised: the
-- database rounds it off on the way in.
--
-- A member is never shown a distance as a number, only a bucket ("across
-- town"). Between the rounding and the bucketing, two people comparing notes
-- cannot trilaterate each other.
--
-- `neighborhood` survives as free text people type themselves — "Grant Park",
-- "the west side" — because it reads like a person and not a form field. It is
-- decoration now. Nothing matches on it.
-- ============================================================================

alter table public.profiles
  add column if not exists lat numeric(6, 3),
  add column if not exists lng numeric(7, 3),
  add column if not exists travel_radius_km int;

comment on column public.profiles.lat is
  'Latitude, deliberately rounded to ~110m. Never shown to members as a number.';
comment on column public.profiles.lng is
  'Longitude, deliberately rounded to ~110m. Never shown to members as a number.';
comment on column public.profiles.travel_radius_km is
  'How far this member will travel. Matching uses the SMALLER of the two radii, so both people have to be willing.';

-- Range checks, because a swapped lat/lng is the classic bug here and silently
-- puts somebody in the Indian Ocean rather than failing. Both are nullable:
-- members who applied before this migration have no point, and the matching
-- code treats a missing point as "don't filter" rather than "no matches".
alter table public.profiles
  drop constraint if exists profiles_lat_range;
alter table public.profiles
  add constraint profiles_lat_range
  check (lat is null or (lat >= -90 and lat <= 90));

alter table public.profiles
  drop constraint if exists profiles_lng_range;
alter table public.profiles
  add constraint profiles_lng_range
  check (lng is null or (lng >= -180 and lng <= 180));

-- Half a coordinate is worse than none: it reads as a valid point on the
-- prime meridian or the equator, and Null Island is a real place in every
-- dataset that skipped this check.
alter table public.profiles
  drop constraint if exists profiles_point_whole;
alter table public.profiles
  add constraint profiles_point_whole
  check ((lat is null) = (lng is null));

-- 1km is "walking distance only"; 500km is a different city and means the
-- radius has stopped doing anything, which is a choice somebody is allowed to
-- make. Outside that range is a bug or a unit mix-up (miles, metres).
alter table public.profiles
  drop constraint if exists profiles_travel_radius;
alter table public.profiles
  add constraint profiles_travel_radius
  check (travel_radius_km is null or (travel_radius_km between 1 and 500));

-- ---------------------------------------------------------------------------
-- The view the app actually reads
-- ---------------------------------------------------------------------------
--
-- `lat` and `lng` go on the END of the select list, not beside `neighborhood`
-- where they belong. `create or replace view` can only append columns — putting
-- them in the middle is a "cannot change name of view column" error, and the
-- alternative is dropping the view, which takes every grant and dependent
-- policy with it. Appended is the safe edit.
--
-- `travel_radius_km` is deliberately NOT here. It is an input to matching, not
-- something one member should learn about another: knowing somebody set 5km
-- narrows where they live far more than the rounded point does, and there is no
-- screen that needs it. The drop builder reads it from `profiles` directly,
-- through the service role.
create or replace view public.visible_profiles as
  select
    id,
    first_name,
    extract(year from age(birthdate::timestamptz))::int as age,
    gender,
    neighborhood,
    height_cm,
    occupation,
    coalesce(
      (
        select jsonb_agg(photo.value order by ((photo.value ->> 'order')::int))
        from jsonb_array_elements(p.photos) photo(value)
        where coalesce((photo.value ->> 'approved')::boolean, false)
      ),
      '[]'::jsonb
    ) as photos,
    prompts,
    voice_intro_path,
    interests,
    lat,
    lng
  from public.profiles p
  where can_view_profile(id);

comment on view public.visible_profiles is
  'Profile fields a member is allowed to see, gated by can_view_profile(). Includes the rounded point so the client can bucket a distance; excludes travel_radius_km, which is matching input only.';
