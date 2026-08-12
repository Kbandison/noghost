"use client";

import { createClient } from "@noghost/db/browser";

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

export type Bucket = "photos" | "verification-selfies";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/** Returns the storage path to submit, or throws with something readable. */
export async function uploadImage(bucket: Bucket, file: File): Promise<string> {
  // Seed mode keeps the funnel walkable with nothing provisioned. The filename
  // stands in for a path; nothing is stored anywhere.
  if (SEED) return file.name;

  const extension = EXTENSIONS[file.type];
  if (!extension) {
    // Matches `allowed_mime_types` on the bucket. Better to say so here than
    // let Storage reject it with a code.
    throw new Error("That file type isn't supported. Use a JPEG, PNG or WebP.");
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
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
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
