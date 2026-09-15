"use client";

import Image from "next/image";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { PHOTO_MAX, PHOTO_MIN, PROMPT_COUNT } from "@noghost/config";
import { PROMPT_LIBRARY } from "@noghost/config/copy";
import { Button } from "@/components/ui/button";
import { VoicePlayer } from "@/components/ui/voice-player";
import { VoiceRecorder, type Recording } from "@/components/ui/voice-recorder";
import { cn } from "@/lib/utils";
import { publicPhotoUrl } from "@/lib/photos";
import { SaveNote, useAutosave } from "./use-autosave";
import { screeningThumbnail, uploadImage, uploadVoiceIntro } from "@/lib/upload";
import {
  screenBeforeUpload,
  screenPhoto,
} from "@/app/(apply)/apply/start/photo-actions";
import { VOICE_INTRO_MAX_MS } from "@/lib/voice";
import type { ProfilePhotoRow } from "@/lib/settings";
import { LocationField } from "@/components/ui/location-field";
import { saveAbout, saveLocation, savePhotos, savePrompts, saveVoiceIntro, type SettingsState } from "./actions";

const initial: SettingsState = {};

/**
 * Editing the three prompts — §7.2, §9.7.
 *
 * Controlled, for the reason the notification toggles are: React 19 resets a
 * form after its action runs, so a rejected save would otherwise wipe what they
 * typed and leave them staring at an error about text that is no longer there.
 *
 * A question already in use is disabled in the other two pickers rather than
 * rejected on submit. §9.7 has members answer three *different* prompts, and
 * finding that out after writing an answer is a worse way to learn it.
 */
export function PromptsForm({
  prompts,
}: {
  prompts: { prompt_id: string; answer: string }[];
}) {
  const [state, action] = useActionState(savePrompts, initial);
  const form = useRef<HTMLFormElement>(null);
  const { state: saveState, queue, flush } = useAutosave((data) =>
    startTransition(() => action(data)),
  );
  const send = () => form.current && queue(new FormData(form.current));

  const [rows, setRows] = useState(() =>
    Array.from({ length: PROMPT_COUNT }, (_, i) => ({
      prompt_id: prompts[i]?.prompt_id ?? PROMPT_LIBRARY[i]?.id ?? "",
      answer: prompts[i]?.answer ?? "",
    })),
  );

  const set = (i: number, patch: Partial<(typeof rows)[number]>) => {
    setRows((current) => current.map((row, j) => (j === i ? { ...row, ...patch } : row)));
    /*
     * Queued from the DOM on the next tick rather than from `rows`: this runs
     * before React has re-rendered, so reading state here would send the
     * answer as it was one keystroke ago.
     */
    queueMicrotask(send);
  };

  return (
    <form ref={form} action={action} className="space-y-6" onBlur={flush}>
      {rows.map((row, i) => (
        <div key={i}>
          <label htmlFor={`prompt-${i}`} className="sr-only">
            Question {i + 1}
          </label>
          <select
            id={`prompt-${i}`}
            name={`prompt-${i}`}
            value={row.prompt_id}
            onChange={(event) => set(i, { prompt_id: event.target.value })}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[15px] focus:border-[var(--accent)] focus:outline-none"
          >
            {PROMPT_LIBRARY.map((prompt) => (
              <option
                key={prompt.id}
                value={prompt.id}
                disabled={rows.some((other, j) => j !== i && other.prompt_id === prompt.id)}
              >
                {prompt.text}
              </option>
            ))}
          </select>

          <label htmlFor={`answer-${i}`} className="sr-only">
            Your answer to question {i + 1}
          </label>
          <textarea
            id={`answer-${i}`}
            name={`answer-${i}`}
            rows={2}
            maxLength={300}
            value={row.answer}
            onChange={(event) => set(i, { answer: event.target.value })}
            placeholder="Something only you would write."
            className="mt-2 w-full resize-y rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-[16px] leading-relaxed placeholder:text-[var(--n-400)] focus:border-[var(--accent)] focus:outline-none"
          />
        </div>
      ))}

      <SaveNote state={saveState} error={state.error} />
    </form>
  );
}

/**
 * Changing where you are — 0028.
 *
 * The same field the funnel uses, because the promise has to be the same in
 * both places: the coordinate is rounded in the browser, and what comes back
 * on screen is a place name rather than a number. A settings page that showed
 * the stored latitude would undo, in one line of text, the reason the column is
 * only three decimals wide.
 *
 * Seeded with what is already stored so somebody who only wants to widen their
 * radius does not have to re-answer where they live.
 */
/**
 * What you do, and how tall you are — the two lines a card prints under your
 * name that nothing has ever been able to fill in.
 *
 * Both optional and both say so. On a dating profile "would rather not say what
 * I do" is an answer, and a required field would make it look like a form
 * somebody failed to finish rather than a choice they made.
 *
 * Height goes in as feet and inches and is stored as centimetres, because the
 * column is `height_cm` and the card converts back. Asking an American for
 * centimetres to match a column name is the schema leaking into the product.
 */
export function AboutForm({
  occupation,
  heightCm,
}: {
  occupation: string | null;
  heightCm: number | null;
}) {
  const [state, action] = useActionState(saveAbout, initial);
  const form = useRef<HTMLFormElement>(null);
  const { state: saveState, queue, flush } = useAutosave((data) =>
    startTransition(() => action(data)),
  );

  /** Whatever is in the fields right now, whichever one moved. */
  const send = () => form.current && queue(new FormData(form.current));

  const totalInches = heightCm === null ? null : Math.round(heightCm / 2.54);
  const feet = totalInches === null ? "" : Math.floor(totalInches / 12);
  const inches = totalInches === null ? "" : totalInches % 12;

  return (
    <form ref={form} action={action} className="space-y-5">
      {/*
        * The heading is gone and the label is not: a visible "What you do"
        * above a box whose placeholder also says what it is was the same words
        * twice. `sr-only` keeps the field named for anybody who cannot see the
        * placeholder, which is the half of it that was doing work.
        */}
      <label className="block">
        <span className="sr-only">What you do</span>
        <input
          name="occupation"
          type="text"
          maxLength={60}
          defaultValue={occupation ?? ""}
          placeholder="What you do — optional"
          onChange={send}
          onBlur={flush}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-[16px] focus:border-[var(--accent)] focus:outline-none"
        />
      </label>

      <fieldset>
        <legend className="mb-1.5 block text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
          Height
        </legend>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            <input
              name="feet"
              type="number"
              min={3}
              max={8}
              defaultValue={feet}
              placeholder="—"
              onChange={send}
              onBlur={flush}
              className="w-20 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-3 text-[16px] tabular-nums focus:border-[var(--accent)] focus:outline-none"
            />
            <span className="text-[15px] text-[var(--text-secondary)]">ft</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              name="inches"
              type="number"
              min={0}
              max={11}
              defaultValue={inches}
              placeholder="—"
              onChange={send}
              onBlur={flush}
              className="w-20 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-3 text-[16px] tabular-nums focus:border-[var(--accent)] focus:outline-none"
            />
            <span className="text-[15px] text-[var(--text-secondary)]">in</span>
          </label>
        </div>
        <p className="mt-2 text-[14px] text-[var(--text-dim)]">
          Both optional. Leave them empty and your card just won&rsquo;t mention them.
        </p>
      </fieldset>

      <SaveNote state={saveState} error={state.error} />
    </form>
  );
}

export function LocationForm({
  lat,
  lng,
  travelRadiusKm,
}: {
  lat: number | null;
  lng: number | null;
  travelRadiusKm: number | null;
}) {
  const [state, action, pending] = useActionState(saveLocation, initial);

  return (
    <form action={action} className="space-y-5">
      <LocationField
        defaultLat={lat ?? undefined}
        defaultLng={lng ?? undefined}
        defaultLabel={lat === null ? undefined : "Where you told us"}
        defaultRadiusKm={travelRadiusKm ?? undefined}
      />

      {state.error && (
        <p role="alert" className="text-[15px] text-[var(--error)]">
          {state.error}
        </p>
      )}
      {state.saved && !state.error && (
        <p role="status" className="text-[15px] text-[var(--success)]">
          Saved.
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save location"}
      </Button>
    </form>
  );
}


/**
 * Editing photos — §7.2, and the member half of 0020's review loop.
 *
 * Uploads happen in the browser, straight to the `photos` bucket, because the
 * storage policy is folder-scoped to the member's own id and that is a better
 * boundary than a server action relaying bytes. The action only ever writes the
 * array of paths.
 *
 * A newly added photo is marked as waiting from the moment it appears, before
 * anything is saved. §7.3 sends changed photos back through review, and finding
 * that out afterwards — "why is my new photo not on my card" — is the confusion
 * this label exists to prevent. Removing is immediate and reordering is by
 * position, so the first photo is always the one that leads the card.
 */
export function PhotosForm({ photos }: { photos: ProfilePhotoRow[] }) {
  const [state, action, pending] = useActionState(savePhotos, initial);
  const [rows, setRows] = useState<ProfilePhotoRow[]>(photos);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const save = (next: ProfilePhotoRow[]) => {
    const data = new FormData();
    for (const photo of next) data.append("paths", photo.path);
    startTransition(() => action(data));
  };

  async function add(files: FileList | null) {
    const picked = Array.from(files ?? []).slice(0, PHOTO_MAX - rows.length);
    if (picked.length === 0) return;
    setUploadError(null);
    setBusy(true);
    try {
      const uploaded: ProfilePhotoRow[] = [];
      for (const file of picked) {
        /*
         * Screened here too, and it was not.
         *
         * The funnel refuses explicit content at the upload, but this screen —
         * where an admitted member changes their photos months later — went
         * straight to storage. Moderation that only covers the way in is
         * moderation somebody walks around by waiting until they are in.
         *
         * Same order as the funnel: judge a small copy first so nothing
         * unusable reaches a publicly readable bucket, then confirm against the
         * stored file, which is what a reviewer and the approval flag rest on.
         */
        const data = new FormData();
        data.set("thumb", await screeningThumbnail(file));
        const screened = await screenBeforeUpload(data);
        if (screened.verdict === "refuse") {
          setUploadError(screened.reason ?? "That photo can’t be used here. Pick a different one.");
          continue;
        }

        const path = await uploadImage("photos", file);
        const confirmed = await screenPhoto(path);
        if (confirmed.verdict === "refuse") {
          setUploadError(confirmed.reason ?? "That photo can’t be used here. Pick a different one.");
          continue;
        }

        uploaded.push({ path, approved: false });
      }
      if (uploaded.length === 0) return;
      const next = [...rows, ...uploaded];
      setRows(next);
      save(next);
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : "That upload didn't work.");
    } finally {
      setBusy(false);
    }
  }

  function remove(path: string) {
    const next = rows.filter((photo) => photo.path !== path);
    setRows(next);
    /*
     * The object is left in the bucket. Members can delete their own photo
     * objects, but doing it here would destroy the file the instant the array
     * is rewritten — before the save is known to have landed, and with no way
     * back if they remove one by accident. An unreferenced file in a
     * public-read bucket is a small cost against that.
     */
    save(next);
  }

  /*
   * Reordering by pointer, which is the gesture anybody tries on a grid of
   * photos and the one the arrow buttons underneath were standing in for.
   *
   * Pointer events rather than HTML5 drag-and-drop: `draggable` does not fire
   * on touch at all, so the native API would have shipped a feature that works
   * only on the devices that were already served by the arrows.
   *
   * A short hold before the drag engages, because this grid sits inside a
   * scrolling page. Engaging on first contact would mean every attempt to
   * scroll past three-across photos picked one up instead; 180ms separates the
   * two without feeling like a wait.
   */
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  const indexAt = (x: number, y: number): number | null => {
    const tiles = grid.current?.querySelectorAll("[data-photo-index]");
    if (!tiles) return null;
    for (const tile of tiles) {
      const box = tile.getBoundingClientRect();
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) {
        return Number(tile.getAttribute("data-photo-index"));
      }
    }
    return null;
  };

  /*
   * Dragging starts on a handle, and the handle is the fix for a bug the tests
   * could not see.
   *
   * The first version listened on the whole tile and waited 180ms before
   * engaging, switching `touch-action` to none at that point. With a mouse that
   * works, which is why it passed — Playwright drives mouse events and a mouse
   * has no `touch-action` semantics at all. On a phone it cannot work:
   * `touch-action` is read when the gesture *begins*, so changing it 180ms in
   * is too late. The browser has already claimed the touch for scrolling and
   * sends `pointercancel`, which ends the drag before it starts.
   *
   * A handle carrying `touch-action: none` from the start is the way out. It is
   * small, so the rest of the tile still scrolls the page, and it needs no hold
   * because grabbing it is unambiguous.
   */
  function startDrag(path: string, event: React.PointerEvent) {
    if (pending || busy) return;
    // Keeps the move and up events coming to this element even when the finger
    // leaves it, which it immediately does.
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(path);
    setOver(indexAt(event.clientX, event.clientY));
  }

  function onMove(event: React.PointerEvent) {
    if (!dragging) return;
    setOver(indexAt(event.clientX, event.clientY));
  }

  function endDrag() {
    if (!dragging) return;
    const from = rows.findIndex((photo) => photo.path === dragging);
    const to = over;
    setDragging(null);
    setOver(null);
    if (from < 0 || to === null || to === from) return;

    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    setRows(next);
    save(next);
  }

  const waiting = rows.filter((photo) => !photo.approved).length;

  return (
    <div className="space-y-4">
      <div
        ref={grid}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="grid grid-cols-3 gap-3"
      >
        {rows.map((photo, i) => (
          <div
            key={photo.path}
            data-photo-index={i}
            className={cn(
              "relative select-none transition-transform duration-150",
              dragging === photo.path && "scale-[0.97] opacity-60",
              over === i && dragging !== null && dragging !== photo.path && "-translate-y-1",
            )}
          >
            <div
              className={cn(
                "relative aspect-[4/5] overflow-hidden rounded-md border bg-[var(--bg-secondary)]",
                over === i && dragging !== null && dragging !== photo.path
                  ? "border-[var(--accent)]"
                  : "border-[var(--border)]",
              )}
            >
              {publicPhotoUrl(photo.path) ? (
                <Image
                  src={publicPhotoUrl(photo.path)}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 30vw, 180px"
                  className="pointer-events-none object-cover"
                />
              ) : null}
              {/*
                * The handle, and the only thing here that starts a drag.
                *
                * `touch-none` is on it permanently rather than applied when a
                * drag begins — `touch-action` is read at the start of a
                * gesture, so setting it later does nothing and the browser
                * scrolls instead. Small on purpose: the rest of the tile still
                * scrolls the page normally.
                */}
              <button
                type="button"
                onPointerDown={(event) => startDrag(photo.path, event)}
                onPointerMove={onMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                disabled={rows.length < 2 || pending}
                aria-label={`Reorder photo ${i + 1}`}
                title="Drag to reorder"
                className="absolute left-1.5 top-1.5 flex h-7 w-7 touch-none items-center justify-center rounded-full bg-[var(--bg-primary)]/85 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)] disabled:opacity-0 cursor-grab active:cursor-grabbing"
              >
                <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4" fill="currentColor">
                  <circle cx="6" cy="4" r="1.3" />
                  <circle cx="10" cy="4" r="1.3" />
                  <circle cx="6" cy="8" r="1.3" />
                  <circle cx="10" cy="8" r="1.3" />
                  <circle cx="6" cy="12" r="1.3" />
                  <circle cx="10" cy="12" r="1.3" />
                </svg>
              </button>

              {/*
                * Top right, on the photo. It replaces a "Remove" link that sat
                * underneath beside two arrows; the arrows went with the drag,
                * so this is the only control left and it belongs on the thing
                * it acts on. `stopPropagation` on pointerdown so pressing it
                * never starts a drag.
                */}
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => remove(photo.path)}
                disabled={pending || rows.length <= PHOTO_MIN}
                aria-label={`Remove photo ${i + 1}`}
                title={rows.length <= PHOTO_MIN ? `${PHOTO_MIN} photos minimum` : "Remove"}
                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-primary)]/85 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-primary)] hover:text-[var(--error)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-[var(--text-secondary)]"
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M2.5 4h11M6.5 4V2.75h3V4M4 4l.6 9.2a1 1 0 0 0 1 .8h4.8a1 1 0 0 0 1-.8L12 4" />
                  <path d="M6.6 6.6v5M9.4 6.6v5" />
                </svg>
              </button>

              {!photo.approved && (
                <span className="absolute inset-x-0 bottom-0 bg-[var(--bg-primary)]/90 px-1.5 py-1 text-center text-[11px] leading-tight text-[var(--text-dim)]">
                  Being reviewed
                </span>
              )}
            </div>

            {i === 0 && (
              <p className="mt-1 text-center text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--accent-text)]">
                Leads
              </p>
            )}
          </div>
        ))}
      </div>

      {/*
        * Why the bin is dead, said where it can be read.
        *
        * At the minimum every remove button is disabled, and the only
        * explanation was a `title` — a tooltip, which a phone never shows. The
        * control looked broken rather than refused, and the first report of
        * this was somebody telling me delete did not work while holding exactly
        * three photos.
        */}
      {rows.length <= PHOTO_MIN && (
        <p className="text-[14px] leading-relaxed text-[var(--text-secondary)]">
          {PHOTO_MIN} photos is the minimum, so there&rsquo;s nothing to remove right now. Add
          one and the bins turn on.
        </p>
      )}

      <p className="text-[14px] leading-relaxed text-[var(--text-dim)]">
        {PHOTO_MIN}&ndash;{PHOTO_MAX} photos. The first one leads your card. Drag the grip to
        reorder.
        {waiting > 0 && (
          <>
            {" "}
            <strong className="font-semibold text-[var(--text-secondary)]">
              {waiting === 1 ? "One is" : `${waiting} are`} being reviewed
            </strong>{" "}
            &mdash; a person looks at every new photo before it goes on your card, usually the same
            day. Nobody sees it until then.
          </>
        )}
      </p>

      {(state.error ?? uploadError) && (
        <p role="alert" className="text-[15px] leading-snug text-[var(--error)]">
          {state.error ?? uploadError}
        </p>
      )}

      <label className="inline-block">
        <span
          className={`inline-block cursor-pointer rounded-md border border-[var(--border)] px-4 py-2.5 text-[15px] transition-colors hover:border-[var(--text-dim)] ${
            rows.length >= PHOTO_MAX || busy ? "cursor-not-allowed opacity-40" : ""
          }`}
        >
          {busy ? "Uploading…" : "Add a photo"}
        </span>
        <input
          type="file"
          // Anything the browser can decode. `uploadImage` re-encodes to JPEG
          // before upload, so a HEIC straight off a phone is fine here — it
          // was not, and the refusal named formats people cannot convert to.
          accept="image/*"
          multiple
          disabled={rows.length >= PHOTO_MAX || busy}
          onChange={(event) => {
            void add(event.target.files);
            event.target.value = "";
          }}
          className="sr-only"
        />
      </label>
    </div>
  );
}

/**
 * The voice intro, in Settings.
 *
 * `url` is a signed link so an existing recording is playable; a fresh one
 * plays from its object URL until the page reloads. The distinction never
 * reaches the member, which is the point — record, hear it, keep it or drop it.
 *
 * `hasIntro` is passed separately rather than inferred from `url` because
 * signing can fail on its own. A member whose link did not sign still has an
 * intro on their card, and showing them an empty recorder would say otherwise.
 */
export function VoiceIntroForm({ url, hasIntro }: { url: string | null; hasIntro: boolean }) {
  const [state, action, pending] = useActionState(saveVoiceIntro, initial);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [saved, setSaved] = useState(hasIntro);
  const [savedUrl, setSavedUrl] = useState<string | null>(url);
  /*
   * Asking to re-record does not delete anything. The old intro stays on the
   * card until a new one lands, so somebody who changes their mind mid-way and
   * closes the tab keeps what they had — and the copy below says so, because a
   * player that vanishes on click reads as a deletion that already happened.
   */
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    return () => URL.revokeObjectURL(recording.url);
  }, [recording]);

  const save = (path: string) => {
    const data = new FormData();
    data.set("path", path);
    startTransition(() => action(data));
  };

  async function keep(next: Recording) {
    setRecording(next);
    setError(null);
    setBusy(true);
    try {
      save(await uploadVoiceIntro(next.blob));
      setSaved(true);
      setSavedUrl(null);
      setReplacing(false);
    } catch (cause) {
      setRecording(null);
      setError(cause instanceof Error ? cause.message : "That upload didn't work.");
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    setRecording(null);
    setSaved(false);
    setSavedUrl(null);
    setReplacing(false);
    save("");
  }

  /*
   * `replacing` outranks both sources. Checking it only against the saved intro
   * left "record a different one" dead after somebody had just recorded one in
   * this session — `recording` was still set, so the player stayed put and the
   * button did nothing. Nothing is torn down to get here, which is what lets
   * "keep the one I have" put the player back.
   */
  const playing = replacing
    ? null
    : (recording ?? (saved ? { url: savedUrl, durationMs: null } : null));

  return (
    <div className="space-y-4">
      {playing ? (
        <>
          {playing.url ? (
            <VoicePlayer
              src={playing.url}
              durationMs={playing.durationMs}
              mine
              className="max-w-full"
            />
          ) : (
            /*
             * A path with no signed link. Their intro is on their card and
             * playing it here is what failed — which is a different sentence
             * from "you don't have one", and the difference decides whether
             * they re-record something that was never broken.
             */
            <p className="text-[15px] leading-snug text-[var(--text-dim)]">
              Your intro is saved and playing on your card. We couldn&rsquo;t load it here just
              now &mdash; reload the page to try again.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              disabled={pending || busy}
              onClick={() => setReplacing(true)}
              className="text-[15px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
            >
              Record a different one
            </button>
            <button
              type="button"
              disabled={pending || busy}
              onClick={remove}
              className="text-[15px] text-[var(--text-dim)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--error)] disabled:opacity-40"
            >
              Remove it
            </button>
          </div>
        </>
      ) : (
        <>
          <VoiceRecorder onRecorded={keep} disabled={busy || pending} maxMs={VOICE_INTRO_MAX_MS} />
          {replacing && (
            <div className="flex flex-wrap items-center gap-4">
              <p className="text-[14px] text-[var(--text-dim)]">
                The one you have stays on your card until this replaces it.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => setReplacing(false)}
                className="text-[15px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
              >
                Keep the one I have
              </button>
            </div>
          )}
        </>
      )}

      {busy && <p className="text-[14px] text-[var(--text-dim)]">Saving it&hellip;</p>}
      {(state.error ?? error) && (
        <p role="alert" className="text-[15px] leading-snug text-[var(--error)]">
          {state.error ?? error}
        </p>
      )}
      {state.saved && !state.error && !busy && (
        <p role="status" className="text-[15px] text-[var(--success)]">
          Saved.
        </p>
      )}

      <p className="text-[14px] leading-relaxed text-[var(--text-dim)]">
        Thirty seconds, optional, and it sits on your card next to your name. Unlike a photo it
        doesn&rsquo;t wait for review.
      </p>
    </div>
  );
}
