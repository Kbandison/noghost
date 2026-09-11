"use client";

import { createClient } from "@noghost/db/browser";
import { baseMimeType, extensionFor } from "./voice";

/**
 * Client-side upload to Supabase Storage.
 *
 * Uploads go straight from the browser to Storage rather than through a Server
 * Action. Two reasons: image bytes never traverse the Next server (a selfie
 * plus six photos is tens of megabytes of pointless egress), and the storage
 * policies in 0008 are written against `auth.uid()`, which the member's own
 * session already carries.
 *
 * The folder is the user id because that is exactly what the policy checks:
 *
 *   (storage.foldername(name))[1] = (select auth.uid())::text
 *
 * so a path that doesn't start with your own id is rejected by the database,
 * not by this code.
 */

const SEED = process.env.NEXT_PUBLIC_USE_SEED_DATA === "true";

export type Bucket = "photos" | "verification-selfies" | "voice-intros";

/** Matches the `photos` and `verification-selfies` ceilings set in 0008. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/*
 * What may be stored, matching `allowed_mime_types` after 0035. WebP and AVIF
 * came off that list because Rekognition reads neither, and a photo it cannot
 * read fails every check silently.
 *
 * `prepareImage` produces JPEG from anything the browser can decode, so this is
 * a backstop for the fallback path rather than the gate it used to be.
 */
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

/** Returns the storage path to submit, or throws with something readable. */
export async function uploadImage(bucket: Bucket, file: File): Promise<string> {
  // Seed mode keeps the funnel walkable with nothing provisioned. The filename
  // stands in for a path; nothing is stored anywhere.
  if (SEED) return file.name;

  /*
   * Converted first, so the checks below are about what will actually be
   * stored rather than what came off the camera. A HEIC from an iPhone and a
   * twelve-megabyte JPEG both arrive here as a WebP of a few hundred kilobytes,
   * which is why neither is refused any more.
   */
  const prepared = await prepareImage(file);

  const extension = EXTENSIONS[prepared.type];
  if (!extension) {
    /*
     * Only reachable when the conversion could not run — a browser that cannot
     * decode this particular format, so `prepareImage` handed back the original
     * untouched. Naming the formats is useful here precisely because the usual
     * escape hatch has already been tried.
     */
    throw new Error(
      "We couldn't read that image. Try a JPEG or PNG, or a screenshot of it.",
    );
  }

  if (prepared.size > MAX_UPLOAD_BYTES) {
    // Also only reachable unconverted: anything re-encoded at 2000px is far
    // under this.
    throw new Error("That image is too large. Try a JPEG or PNG under 8MB.");
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Your session expired. Go back to the code step and verify again.");
  }

  /*
   * A fresh uuid every time, and `upsert: false` — both deliberate.
   *
   * Upsert would need UPDATE on storage.objects, and `verification-selfies`
   * has no update policy at all: insert, admin-read, admin-delete, nothing
   * else. So overwriting a selfie in place is impossible by design, and a
   * retake has to become a new object. Turning upsert on here fails at the
   * database, not the client.
   */
  const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, prepared, {
    contentType: prepared.type,
    upsert: false,
  });

  if (error) {
    console.error(`[upload] ${bucket}: ${error.message}`);
    const message = error.message.toLowerCase();
    if (message.includes("exceeded") || message.includes("too large")) {
      throw new Error("That image is too large. 8MB maximum.");
    }
    throw new Error("The upload didn't go through. Try again.");
  }

  return path;
}

/**
 * Re-exported so the funnel's Back step keeps showing real thumbnails.
 *
 * The implementation moved to `lib/photos.ts`, which carries no `"use client"`
 * — the inbox renders on the server and could not call it from here.
 */
export { publicPhotoUrl } from "./photos";

/**
 * The optional 30s intro — §7.2's onboarding, and the recorder in Settings.
 *
 * Separate from `uploadImage` because nothing about it is shared: a different
 * bucket, a different mime allowlist, and a size limit that is about how long
 * somebody talked rather than how big their camera is. Folding audio into a
 * function named for images would mean one more place to remember that
 * `EXTENSIONS` is about pictures.
 *
 * The path is `<user_id>/<uuid>.<ext>`, which is what 0015's policy scopes on.
 */
export async function uploadVoiceIntro(blob: Blob): Promise<string> {
  if (SEED) return `seed/${crypto.randomUUID()}.webm`;

  const mime = baseMimeType(blob.type);
  const extension = extensionFor(mime);
  if (!extension) throw new Error("That recording isn't in a format we can store.");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Your session expired. Verify your number again.");

  const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("voice-intros").upload(path, blob, {
    contentType: mime,
    upsert: false,
  });

  if (error) {
    console.error(`[upload] voice-intros: ${error.message}`);
    // Named precisely: without 0015 the bucket does not exist, and "try again"
    // would send somebody re-recording forever.
    if (/bucket not found/i.test(error.message)) {
      throw new Error(
        "This database hasn't had 0015_voice_homes.sql applied, so a voice intro has nowhere " +
          "to go. Skip this step for now.",
      );
    }
    if (/exceeded|too large/i.test(error.message)) {
      throw new Error("That recording is too long to store.");
    }
    throw new Error("The upload didn't go through. Try again.");
  }

  return path;
}

/**
 * Decode, rotate, shrink and re-encode — in the browser, before anything is
 * uploaded.
 *
 * Three problems this solves at once, all of which people hit immediately.
 *
 * **Format.** The bucket accepted JPEG, PNG, WebP and AVIF, and nothing else.
 * A photo straight off an iPhone is HEIC, which is not on that list, so it was
 * refused with a message about supported types most people cannot act on.
 * Anything the browser can decode now becomes a JPEG on the way out — JPEG
 * specifically, because Rekognition reads only that and PNG.
 *
 * **Size.** A modern phone camera produces eight to twelve megabytes. The
 * bucket's ceiling is eight, so perfectly ordinary photos were rejected as too
 * large. Two thousand pixels on the long edge is more than a profile card or a
 * face comparison can use, and it lands around a fifth of a megabyte.
 *
 * **Orientation.** Phones record rotation as EXIF metadata rather than rotating
 * the pixels. Drawing to a canvas discards metadata, so without
 * `imageOrientation: "from-image"` every portrait photo would arrive on its
 * side — and silently, because the original looks fine everywhere else.
 */
const MAX_EDGE = 2000;

async function reencode(file: File, maxEdge: number, quality: number): Promise<File | null> {
  try {
    // `from-image` applies the EXIF rotation while decoding. Without it the
    // canvas gets the raw pixels and the rotation is lost.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

    // Never upscale: a small photo stays exactly as large as it was.
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    /*
     * JPEG, and not WebP, which would be about a third smaller.
     *
     * Rekognition reads PNG and JPEG and nothing else — its own SDK says so for
     * both `CompareFaces` and `DetectModerationLabels`. A WebP profile photo
     * would upload happily, look right everywhere, and then fail every check
     * silently: `compareFaces` returns null, which this system reads as "no
     * comparison was possible" and routes to a human. Nobody would ever see an
     * error; the face comparison would simply never work for that member.
     *
     * A third of a few hundred kilobytes is not worth a whole class of
     * invisible failure.
     */
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob || blob.type !== "image/jpeg") return null;

    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } catch {
    // A format this browser cannot decode. The caller decides what to say.
    return null;
  }
}

/**
 * What actually gets stored: re-encoded when possible, the original when not.
 *
 * Falling back rather than refusing matters. A browser without
 * `createImageBitmap`, or one that cannot decode this particular file, should
 * still be able to upload a JPEG — the conversion is an improvement on the
 * common path, not a new requirement.
 */
export async function prepareImage(file: File): Promise<File> {
  return (await reencode(file, MAX_EDGE, 0.85)) ?? file;
}

/**
 * A small copy of an image, for asking what is in it.
 *
 * Moderation needs the scene, not the detail — so sending a 1024px copy instead
 * of a full photograph makes the answer arrive in about a second rather than
 * several, and means the original never leaves the device until it has been
 * allowed to.
 */
export async function screeningThumbnail(file: File, maxEdge = 1024): Promise<File> {
  return (await reencode(file, maxEdge, 0.8)) ?? file;
}
