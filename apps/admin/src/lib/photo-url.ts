/**
 * Applicant photos are in the public bucket, so this is plain string
 * construction — no round trip, and it goes through the CDN rather than
 * Supabase's egress meter (BACKEND.md layer 2).
 *
 * Split out of `storage.ts` because the photo review grid is a client
 * component: importing this from there dragged `next/headers` into the browser
 * bundle through `supabase.ts`, which is the same boundary the member app's
 * `lib/photos.ts` exists to keep. A pure URL builder has no business sitting
 * beside a server client.
 */
export function publicPhotoUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/photos/${path}`;
}
