/**
 * The public URL for an uploaded profile photo.
 *
 * Its own module, with no `"use client"`, because both sides need it: the drop
 * card is a Client Component and the inbox is rendered on the server. It used to
 * live in `lib/upload.ts`, which is client-only, and calling it from a Server
 * Component failed at runtime with "attempted to call publicPhotoUrl() from the
 * server" — a `next build` and a typecheck both pass on that, so nothing but
 * rendering the page finds it.
 *
 * Built by string rather than through `supabase.storage.getPublicUrl()`: the
 * URL is a fixed, documented shape, and constructing it needs no client, no
 * session, and nothing that only exists in a browser.
 *
 * Only `photos` is public. `verification-selfies` has no member read policy at
 * all — spec §9.8, review-team eyes only — so there is deliberately no
 * equivalent for it.
 */

const SEED = process.env.NEXT_PUBLIC_USE_SEED_DATA === "true";

export function publicPhotoUrl(path: string): string {
  if (SEED || !path) return "";
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return "";
  return `${base}/storage/v1/object/public/photos/${path}`;
}
