"use server";

import { createServiceClient } from "@noghost/db/service";
import { usingSeedData } from "@noghost/config/env";
import { decidePhoto } from "@noghost/logic";
import { allowRequest } from "@/lib/rate-limit";
import { faceChecksConfigured, readPhoto } from "@/lib/rekognition";
import { supabaseServer } from "@/lib/supabase";

/**
 * Judge one photo the moment it is uploaded.
 *
 * This used to happen at filing, five steps later, and that was wrong in three
 * ways at once. The content was accepted and written to the `photos` bucket —
 * which is publicly readable — and left there. The person who uploaded it was
 * never told, so they could not fix it, and learned only that their application
 * was slow for reasons nobody explained. And a reviewer was handed explicit
 * content to look at, which is a thing to ask of a person only when there is no
 * alternative.
 *
 * Now: refused photos are deleted from storage before this returns, and the
 * applicant is told why while the picker is still open.
 *
 * **The verdict is decided here, not sent by the client.** The browser passes a
 * path; what is at that path is read server-side. A client that could report
 * its own photo clean would make the whole thing decorative.
 */

export interface ScreenResult {
  verdict: "ok" | "refuse" | "needs-a-person";
  /** Shown to the applicant only when refused. */
  reason?: string;
}

export async function screenPhoto(path: string): Promise<ScreenResult> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { verdict: "needs-a-person" };

  /*
   * The path has to be theirs. `uploadImage` builds `<user id>/<uuid>.<ext>`
   * and the bucket's insert policy is folder-scoped, so a path under somebody
   * else's folder is either a typo or an attempt to get this endpoint to delete
   * another member's photo.
   */
  if (!path.startsWith(`${user.id}/`)) return { verdict: "needs-a-person" };

  if (usingSeedData() || !faceChecksConfigured()) return { verdict: "needs-a-person" };

  // Each screening is two Rekognition calls. A bound here is as much about the
  // bill as about abuse — six photos is the maximum anybody legitimately needs,
  // and this allows several times that before it says no.
  if (!(await allowRequest("photo-screen", { limit: 30, windowSeconds: 600 }, user.id))) {
    return { verdict: "needs-a-person" };
  }

  const service = createServiceClient();

  const { data: file } = await service.storage.from("photos").download(path);
  if (!file) {
    console.error(`[photos] could not read ${path}`);
    return { verdict: "needs-a-person" };
  }

  const reading = await readPhoto(new Uint8Array(await file.arrayBuffer()));
  const decision = decidePhoto(reading);

  /*
   * Recorded before anything is deleted, so a refusal leaves a trail even
   * though the image it refers to is gone a moment later. "Why did my photo
   * disappear" needs an answer that outlives the photo.
   */
  const { error: writeError } = await service.from("photo_screenings").upsert(
    {
      path,
      user_id: user.id,
      verdict: decision.verdict,
      reason: decision.reason,
      detail: reading
        ? {
            flags: reading.flags,
            contentTypes: reading.contentTypes,
            faceCount: reading.faceCount,
            faceShare: reading.faceShare,
          }
        : {},
    },
    { onConflict: "path" },
  );
  if (writeError) console.error(`[photos] screening ${path}: ${writeError.message}`);

  if (decision.verdict === "refuse") {
    /*
     * Deleted, not merely unapproved. The bucket is publicly readable, so an
     * unapproved explicit photo is still an explicit photo at a URL anybody
     * holding it can open. Leaving it there and marking it hidden would be
     * hiding it from our own screens and nobody else's.
     */
    const { error } = await service.storage.from("photos").remove([path]);
    if (error) console.error(`[photos] removing refused ${path}: ${error.message}`);
    return { verdict: "refuse", reason: decision.reason };
  }

  return { verdict: decision.verdict };
}
