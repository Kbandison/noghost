import { photoList, type ReviewPhoto } from "./photo-list";
import { supabaseServer } from "./supabase";

/**
 * Photos waiting on a reviewer — spec §7.3's "photo re-review".
 *
 * Distinct from the admissions queue, which reviews a *person* once. This is
 * the standing one: a member changes a photo after they are admitted, it lands
 * unapproved, and 0020's view keeps it off everybody's card until somebody
 * looks. Without this screen those photos would sit invisible forever and the
 * member would have no idea why.
 *
 * Read on the admin's own session — `admins read all profiles` is what grants
 * it, and it is also why an admin sees the unapproved ones at all: every other
 * reader goes through `visible_profiles`, which filters them out.
 */

export interface PhotoQueueRow {
  userId: string;
  firstName: string;
  status: string;
  photos: ReviewPhoto[];
  waiting: number;
}

export async function photosAwaitingReview(): Promise<PhotoQueueRow[]> {
  const supabase = await supabaseServer();

  /*
   * Filtered in TypeScript rather than SQL. Asking Postgres for "profiles with
   * any unapproved photo" means a jsonb containment query the hand-written
   * `Database` type cannot express, over a table that is one season's members —
   * a few hundred rows. The wrong optimisation to reach for first.
   */
  const { data, error } = await supabase
    .from("profiles")
    .select("id,first_name,status,photos")
    .order("updated_at", { ascending: true })
    .limit(500);

  if (error) {
    console.error(`[photos] queue: ${error.message}`);
    return [];
  }

  return (data ?? []).flatMap((profile) => {
    const photos = photoList(profile.photos);
    const waiting = photos.filter((photo) => !photo.approved).length;
    if (waiting === 0) return [];
    return [
      {
        userId: profile.id,
        firstName: profile.first_name,
        status: profile.status,
        photos,
        waiting,
      },
    ];
  });
}
