-- NoGhost — storage buckets and their policies. Spec §5.
--
-- Path conventions (the policies depend on them):
--   photos/<user_id>/<uuid>.webp
--   voice-notes/<chat_id>/<uuid>.webm
--   verification-selfies/<user_id>/<uuid>.jpg

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- Public-read once approved, so profile photos come off the CDN rather than
  -- costing Supabase egress on every drop (BACKEND.md layer 2).
  ('photos', 'photos', true, 8388608,
   array['image/jpeg','image/png','image/webp','image/avif']),

  -- Private: participant-scoped signed URLs, short expiry.
  ('voice-notes', 'voice-notes', false, 5242880,
   array['audio/webm','audio/mp4','audio/mpeg','audio/ogg']),

  -- Never client-readable. Admin signed URLs only.
  ('verification-selfies', 'verification-selfies', false, 8388608,
   array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- ============ PHOTOS ============

create policy "photos are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'photos');

create policy "members write only into their own photo folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "members replace only their own photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "members delete only their own photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ============ VOICE NOTES ============
-- Folder is the chat id, so access follows chat participation exactly. Reads
-- go through short-lived signed URLs issued server-side.

create policy "participants read voice notes in their chats"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'voice-notes'
    and is_chat_participant(((storage.foldername(name))[1])::uuid)
  );

create policy "participants record into their own chats"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'voice-notes'
    and is_chat_participant(((storage.foldername(name))[1])::uuid)
  );

-- No update or delete policy: messages are immutable in v1 (spec §5), so a
-- voice note cannot be swapped out after the other person has heard it.

-- ============ VERIFICATION SELFIES ============

create policy "members upload their own selfie"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'verification-selfies'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "only admins read selfies"
  on storage.objects for select to authenticated
  using (bucket_id = 'verification-selfies' and is_admin());

-- Deliberately no member read policy. Spec §9.8: "Review-team eyes only, never
-- shown to members." The member cannot re-download their own selfie either;
-- deletion on request is an admin action.

create policy "admins delete selfies on request"
  on storage.objects for delete to authenticated
  using (bucket_id = 'verification-selfies' and is_admin());
