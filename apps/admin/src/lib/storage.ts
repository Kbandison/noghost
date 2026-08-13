import { supabaseServer } from "./supabase";

/**
 * A short-lived URL for a verification selfie.
 *
 * Signed through the *admin's own session*, not the service client. The
 * `only admins read selfies` policy is `using (bucket_id =
 * 'verification-selfies' and is_admin())`, so Storage refuses to sign this for
 * anyone else — the database decides, not this function.
 *
 * Five minutes. Long enough to compare a face against six photos without the
 * image dying mid-review; short enough that a URL copied out of devtools or
 * left in a browser history is worthless by the time anyone finds it. These
 * URLs carry no auth of their own, so expiry is the only control on them.
 */
const SELFIE_URL_TTL_SECONDS = 300;

export async function signedSelfieUrl(path: string | null): Promise<string | null> {
  if (!path) return null;

  const supabase = await supabaseServer();
  const { data, error } = await supabase.storage
    .from("verification-selfies")
    .createSignedUrl(path, SELFIE_URL_TTL_SECONDS);

  if (error) {
    console.error(`[admin] could not sign selfie ${path}: ${error.message}`);
    return null;
  }
  return data?.signedUrl ?? null;
}

// `publicPhotoUrl` lives in `photo-url.ts`. Not re-exported from here on
// purpose: this module imports `next/headers` through `supabase.ts`, so a
// client component reaching it through this file would pull the server client
// into the browser bundle — which is exactly how it got there before.
