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

/**
 * Judge a photo BEFORE it is stored anywhere.
 *
 * `screenPhoto` below runs against a path, which means the file is already in
 * the `photos` bucket — publicly readable — by the time anybody knows whether
 * it should be. It also means four transfers of a full-size photograph before a
 * verdict exists: browser to storage, storage to here, and twice more to AWS.
 * For an eight-megabyte photo off a phone that is several seconds during which
 * the thing is sitting at a URL.
 *
 * This takes a downscaled copy the browser makes locally — about a hundred
 * kilobytes — and answers the only question that matters at that moment. A
 * refusal comes back quickly, and nothing was uploaded, so there is no window
 * in which the photo exists publicly and no deletion to race.
 *
 * Downscaling does not weaken the judgement: Rekognition is being asked what is
 * in the picture, not to read fine print, and a 1024px copy contains the same
 * scene. It is the same image either way.
 *
 * **This is not the authoritative record.** It cannot be — a client could screen
 * one image and upload another. `screenPhoto` still runs against the stored
 * file afterwards and is what filing trusts. This exists to answer the
 * applicant fast and to keep refused content out of the bucket entirely.
 */
export async function screenBeforeUpload(formData: FormData): Promise<ScreenResult> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { verdict: "needs-a-person" };

  if (usingSeedData() || !faceChecksConfigured()) return { verdict: "needs-a-person" };

  if (!(await allowRequest("photo-screen", { limit: 30, windowSeconds: 600 }, user.id))) {
    return { verdict: "needs-a-person" };
  }

  const thumb = formData.get("thumb");
  if (!(thumb instanceof File)) return { verdict: "needs-a-person" };

  // A downscaled JPEG is small. Anything bigger than this is not the thumbnail
  // the client was asked for, and is not worth spending a Rekognition call on.
  if (thumb.size > 1_000_000) return { verdict: "needs-a-person" };

  const reading = await readPhoto(new Uint8Array(await thumb.arrayBuffer()));
  const decision = decidePhoto(reading);

  /*
   * Only a refusal is acted on here. "needs-a-person" is reported as-is so the
   * caller knows not to celebrate, but the photo is still uploaded — a group
   * shot or a distant face is a perfectly good second photo, and the reviewer
   * decides.
   */
  return decision.verdict === "refuse"
    ? { verdict: "refuse", reason: decision.reason }
    : { verdict: decision.verdict };
}
