-- ============================================================================
-- 0035 — JPEG or PNG, because Rekognition reads nothing else
-- ============================================================================
--
-- `photos` and `verification-selfies` have accepted `image/webp` and
-- `image/avif` since 0008, and every automated check now run against those
-- images reads neither. Amazon Rekognition's own SDK is explicit for both
-- `CompareFaces` and `DetectModerationLabels`: "the image must be either a PNG
-- or JPEG formatted file."
--
-- Which makes a WebP profile photo a silent failure rather than a loud one. It
-- uploads. It displays correctly on every screen. And then `compareFaces`
-- throws `InvalidImageFormatException`, the adapter turns that into null, and
-- null is read everywhere in this codebase as "no comparison was possible" —
-- which routes the application to a human. Nobody sees an error. The face
-- comparison simply never works for that member, and the reason is a file
-- format nobody thought to look at.
--
-- The browser now re-encodes every upload to JPEG before it leaves the device,
-- so in practice nothing produces a WebP any more. This is the database saying
-- the same thing, so a future upload path cannot reintroduce it by accident.
--
-- Existing objects are untouched — `allowed_mime_types` is checked on insert.
-- Any WebP already stored keeps working as an image and keeps failing the face
-- checks, which is what it was doing yesterday.
-- ============================================================================

update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png']
 where id in ('photos', 'verification-selfies');
