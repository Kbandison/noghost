-- ============================================================================
-- 0042 — somewhere to say it in your own words
-- ============================================================================
--
-- A card carries a name, an age, a neighbourhood, a job, a height, three prompt
-- answers and a voice note. `occupation` was the only free text a member could
-- write outside the prompts, which made "About you" a box asking what you do
-- for a living and calling that a bio.
--
-- ---------------------------------------------------------------------------
-- The tension, recorded because it is real
-- ---------------------------------------------------------------------------
--
-- §7.2's cards are photos, prompts and a voice intro, and the prompts exist so
-- that a connect has to reply to something specific — "there is no like button
-- here" is the §9 line, and a prompt is what a reply attaches to. A bio is the
-- thing people skim in place of that, so it can compete with the mechanic
-- rather than add to it.
--
-- Flagged to the user before this was written and the call was theirs: a bio,
-- alongside the job and the height. It is capped short enough to read at a
-- glance rather than instead of the prompts, and it is optional — a blank one
-- leaves a card exactly as it is today.
--
-- No tone check, and that matches the rest: prompt answers are member-written
-- free text shown to every member too, and neither is screened. Reporting is
-- the control on both, from any profile or chat.
-- ============================================================================

alter table public.profiles
  add column if not exists bio text;

comment on column public.profiles.bio is
  'A few lines in the member''s own words, shown on their card under the facts row. Optional and capped at 300 characters by the application — short enough to be read alongside the prompts rather than instead of them. Not tone-checked, matching prompt answers, which are the same kind of text with the same exposure.';

/*
 * The view gains a column and nothing else moves.
 *
 * `create or replace view` can only APPEND — renaming, reordering or dropping
 * a column needs a drop, and Postgres refuses the replace with a message that
 * reads like a syntax error. So `bio` goes last, after `lng`, and every
 * existing reader keeps the shape it already selects.
 */
create or replace view public.visible_profiles as
  select id,
         first_name,
         extract(year from age(birthdate::timestamp with time zone))::integer as age,
         gender,
         neighborhood,
         height_cm,
         occupation,
         coalesce((
           select jsonb_agg(photo.value order by ((photo.value ->> 'order')::integer))
             from jsonb_array_elements(p.photos) photo(value)
            where coalesce((photo.value ->> 'approved')::boolean, false)
         ), '[]'::jsonb) as photos,
         prompts,
         voice_intro_path,
         interests,
         lat,
         lng,
         bio
    from profiles p
   where can_view_profile(id);
