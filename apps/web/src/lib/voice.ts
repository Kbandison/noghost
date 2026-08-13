/**
 * Voice notes — the rules the recorder, the action and the player all share.
 *
 * Deliberately free of server imports. The recorder is a `"use client"` module
 * and reaches for these constants, so anything server-only in here would be
 * pulled into the browser bundle — which is how `photos.ts` came to exist, and
 * how this file came to be split from `voice-urls.ts`.
 *
 * The whole server half already existed before any of this shipped: spec §5's
 * `voice-notes` bucket is private, capped at 5MB, restricted to four audio mime
 * types, and its policies key on `is_chat_participant(<first path segment>)`.
 * So the folder name is not a convention the app is free to choose — it *is*
 * the authorization. Every path here is `<chat_id>/<uuid>.<ext>` for that
 * reason, and the path is built on the server so a client cannot name a folder.
 */

/**
 * One minute, not the column's five.
 *
 * `messages.voice_duration_ms` allows up to 300000, which is the ceiling for
 * anything the schema might hold rather than a product decision. A chat note is
 * a note: a minute is long enough to say something real and short enough that
 * the other person will actually listen.
 *
 * It is also load-bearing for the upload path. The audio travels inside a
 * Server Action, and Next caps an action's request body at 1MB by default. At
 * `AUDIO_BITS_PER_SECOND` a minute is roughly 240KB, so there is comfortable
 * room for the multipart overhead — raise one of these two numbers without the
 * other and sends start failing at the framework boundary, before any of this
 * code runs.
 */
export const MAX_DURATION_MS = 60_000;

/** 32kbps mono. Speech, not music — and see the note on MAX_DURATION_MS. */
export const AUDIO_BITS_PER_SECOND = 32_000;

/**
 * Matches the bucket's `allowed_mime_types`. Chromium and Firefox record
 * `audio/webm;codecs=opus`; Safari records `audio/mp4`. Both are here, so the
 * recorder can take whatever the browser gives it rather than insisting on a
 * container one of them cannot produce.
 */
export const ACCEPTED_AUDIO = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg"] as const;

/** The bucket's own `file_size_limit`, restated so the app can refuse first. */
export const MAX_BYTES = 5 * 1024 * 1024;

/** `audio/webm;codecs=opus` → `audio/webm`. */
export function baseMimeType(type: string): string {
  return type.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function extensionFor(mime: string): string | null {
  switch (baseMimeType(mime)) {
    case "audio/webm":
      return "webm";
    case "audio/mp4":
      return "m4a";
    case "audio/mpeg":
      return "mp3";
    case "audio/ogg":
      return "ogg";
    default:
      return null;
  }
}
