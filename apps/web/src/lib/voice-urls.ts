import { supabaseServer } from "./supabase";

/**
 * Signed URLs for a batch of voice notes, keyed by storage path.
 *
 * One round trip for the whole thread rather than one per message. Paths that
 * cannot be signed — a deleted object, or a path the caller has no policy for —
 * are simply absent from the map, and every caller renders that as "this note
 * can't be played" rather than as an error page.
 *
 * 24 hours is spec §5's number. Worth being clear about what it does and does
 * not buy: every page that renders a note is `force-dynamic`, so a fresh URL is
 * issued on each load and the expiry never affects normal playback. What it
 * bounds is how long a URL stays live once it has left the page — copied out of
 * devtools, or sitting in a tab left open overnight. The latter is the reason
 * it is not five minutes.
 */
export async function signedVoiceUrls(paths: string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(paths.filter(Boolean))];
  if (wanted.length === 0) return new Map();

  const supabase = await supabaseServer();
  const { data, error } = await supabase.storage
    .from("voice-notes")
    .createSignedUrls(wanted, 60 * 60 * 24);

  if (error) {
    console.error(`[voice] signing ${wanted.length} path(s): ${error.message}`);
    return new Map();
  }

  const urls = new Map<string, string>();
  for (const row of data ?? []) {
    // `createSignedUrls` reports per-path failures inline rather than throwing,
    // so a bad path in the batch must not discard the good ones.
    if (row.path && row.signedUrl && !row.error) urls.set(row.path, row.signedUrl);
  }
  return urls;
}
