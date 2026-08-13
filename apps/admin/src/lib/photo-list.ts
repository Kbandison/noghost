/**
 * The photo shape, and the narrowing both sides of the review need.
 *
 * Its own module with no server imports, for the reason `lib/photos.ts` in the
 * member app exists: the review grid is a client component, and importing this
 * from `admissions.ts` dragged `next/headers` into the browser bundle through
 * the transitive `supabase.ts`. A type-only import is erased; the module it
 * comes from still has to be safe for anything that imports the file for real.
 */

export interface ReviewPhoto {
  path: string;
  /** What `visible_profiles` filters on — false means no member has seen it. */
  approved: boolean;
}

/**
 * `photos` is jsonb; narrow it rather than trusting the column's shape.
 *
 * A missing `approved` key reads as false, for the reason 0020's view does the
 * same: an absent flag is not an approval, and a reviewer should be shown the
 * photo to decide rather than have it quietly treated as live.
 */
export function photoList(photos: unknown): ReviewPhoto[] {
  if (!Array.isArray(photos)) return [];
  return photos.flatMap((photo) =>
    typeof photo === "object" && photo !== null && "path" in photo
      ? [
          {
            path: String(photo.path),
            approved:
              "approved" in photo && typeof photo.approved === "boolean" ? photo.approved : false,
          },
        ]
      : [],
  );
}
