-- ============================================================================
-- 0015 — the two voice columns that had nowhere to put a file
-- ============================================================================
--
-- `connects.reply_voice_path` and `profiles.voice_intro_path` have existed since
-- 0002/0003 and neither could ever have been filled in.
--
-- 0008 created one audio bucket, `voice-notes`, and scoped it by chat:
--
--   using (is_chat_participant(((storage.foldername(name))[1])::uuid))
--
-- The folder is a chat id, and that is the authorization. But a connect reply
-- is composed *before* any chat exists — it is the thing that might create one —
-- and a profile's voice intro belongs to no chat at all. Neither had a folder it
-- could legally be written into, so both columns were decoration.
--
-- Separate buckets rather than more paths in `voice-notes`, and not for tidiness.
-- That policy casts the first path segment to `uuid` unconditionally. Add an
-- object named `connect/<uuid>/…` to the same bucket and the cast raises
-- `invalid input syntax for type uuid` — a policy that *errors* rather than
-- returning false, which aborts the whole statement. One stray object would
-- have broken reads of every voice note in the product. A new bucket cannot
-- reach that policy at all.
--
-- Idempotent: safe to re-run. Postgres has no `create policy if not exists`, so
-- each one is dropped first — which also makes this the file to edit if any of
-- these rules ever need changing, rather than a 0016 that adds a second policy
-- with a different name and the same job.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- A connect's voice reply. Path: connect-replies/<from_user>/<uuid>.webm
  ('connect-replies', 'connect-replies', false, 5242880,
   array['audio/webm','audio/mp4','audio/mpeg','audio/ogg']),

  -- The optional 30s profile intro (§7.2). Path: voice-intros/<user_id>/<uuid>.webm
  ('voice-intros', 'voice-intros', false, 5242880,
   array['audio/webm','audio/mp4','audio/mpeg','audio/ogg'])
on conflict (id) do nothing;

-- ============ CONNECT REPLIES ============
-- The folder is the sender's own id, so who may write is answered without
-- consulting another table. Who may *read* is the interesting half: the
-- recipient has to hear it, and at upload time there is no connect row yet
-- pointing at the object.

drop policy if exists "members record a connect reply into their own folder" on storage.objects;
create policy "members record a connect reply into their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'connect-replies'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

/*
 * Two ways in, and the second is the point.
 *
 * The sender always reads their own folder — including in the window between
 * uploading and `send_connect`, when nothing references the object yet. The
 * recipient reads it only once a connect actually points at it, which is also
 * the moment they were meant to hear it. `connects` has its own RLS and this
 * subquery runs as the caller, so "recipient reads their inbox" is what makes
 * the `exists` true; there is no second copy of that rule here.
 */
drop policy if exists "a connect reply is readable by the two people in it" on storage.objects;
create policy "a connect reply is readable by the two people in it"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'connect-replies'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from connects c
        where c.reply_voice_path = storage.objects.name
          and c.to_user = (select auth.uid())
      )
    )
  );

/*
 * Deletable right up until it is sent, and never afterwards.
 *
 * `send_connect` can fail after the audio is uploaded — an already-answered
 * card, the one-connect-per-person rule — and without this the recording would
 * be stranded in a private bucket that nobody, including the person who made
 * it, could remove. The `not exists` clause is what keeps a *sent* reply as
 * immutable as §5 requires: the moment a connect references it, this stops
 * matching.
 */
drop policy if exists "members remove a connect reply that was never sent" on storage.objects;
create policy "members remove a connect reply that was never sent"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'connect-replies'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from connects c where c.reply_voice_path = storage.objects.name
    )
  );

-- ============ VOICE INTROS ============
-- Read by exactly the people who may read the profile it belongs to, which is
-- already one function. `can_view_profile` is `security definer` and returns
-- true for the owner, false when a report sits between two people — so
-- restating any of that here would be a second copy that can drift.

drop policy if exists "a voice intro is readable by anyone who can read the profile" on storage.objects;
create policy "a voice intro is readable by anyone who can read the profile"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'voice-intros'
    and can_view_profile(((storage.foldername(name))[1])::uuid)
  );

-- Unlike a message, an intro is part of a profile rather than a thing that was
-- said to someone, so it can be replaced and removed. Identity fields freeze at
-- admission; this is not one of them.
drop policy if exists "members write their own voice intro" on storage.objects;
create policy "members write their own voice intro"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'voice-intros'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "members replace their own voice intro" on storage.objects;
create policy "members replace their own voice intro"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'voice-intros'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "members delete their own voice intro" on storage.objects;
create policy "members delete their own voice intro"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'voice-intros'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ============ VOICE NOTES — the missing delete ============
--
-- 0008 gave `voice-notes` no delete policy, with the comment that messages are
-- immutable in v1. That is right for a sent note and wrong for one that never
-- became a message.
--
-- `sendVoiceNote` uploads before it inserts, so that a failure leaves an object
-- with no message rather than a message with no audio, and then removes the
-- orphan. With no policy that removal silently did nothing — `pnpm
-- db:verify:voice` says so out loud ("or delete it — the object is still
-- there"), which is how this was found. Every failed send was leaving a file in
-- a private bucket that nothing referenced and nobody could reach.
--
-- Same shape as the connect-reply rule: deletable only while unreferenced, so a
-- note that made it into a conversation stays exactly as immutable as it was.

drop policy if exists "participants remove a voice note that never became a message" on storage.objects;
create policy "participants remove a voice note that never became a message"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'voice-notes'
    and is_chat_participant(((storage.foldername(name))[1])::uuid)
    and not exists (
      select 1 from messages m where m.voice_path = storage.objects.name
    )
  );
