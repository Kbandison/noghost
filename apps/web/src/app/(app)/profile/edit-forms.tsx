"use client";

import Image from "next/image";
import { startTransition, useActionState, useState } from "react";
import { PHOTO_MAX, PHOTO_MIN, PROMPT_COUNT } from "@noghost/config";
import { PROMPT_LIBRARY } from "@noghost/config/copy";
import { Button } from "@/components/ui/button";
import { publicPhotoUrl } from "@/lib/photos";
import { uploadImage } from "@/lib/upload";
import type { ProfilePhotoRow } from "@/lib/settings";
import { savePhotos, savePrompts, type SettingsState } from "./actions";

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
  const [state, action, pending] = useActionState(savePrompts, initial);
  const [rows, setRows] = useState(() =>
    Array.from({ length: PROMPT_COUNT }, (_, i) => ({
      prompt_id: prompts[i]?.prompt_id ?? PROMPT_LIBRARY[i]?.id ?? "",
      answer: prompts[i]?.answer ?? "",
    })),
  );

  const set = (i: number, patch: Partial<(typeof rows)[number]>) =>
    setRows((current) => current.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  return (
    <form action={action} className="space-y-6">
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

      {state.error && (
        <p role="alert" className="text-[15px] leading-snug text-[var(--error)]">
          {state.error}
        </p>
      )}
      {state.saved && !state.error && (
        <p role="status" className="text-[15px] text-[var(--success)]">
          Saved.
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save answers"}
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
        uploaded.push({ path: await uploadImage("photos", file), approved: false });
      }
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

  function move(index: number, by: -1 | 1) {
    const next = [...rows];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setRows(next);
    save(next);
  }

  const waiting = rows.filter((photo) => !photo.approved).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {rows.map((photo, i) => (
          <div key={photo.path}>
            <div className="relative aspect-[4/5] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-secondary)]">
              {publicPhotoUrl(photo.path) ? (
                <Image
                  src={publicPhotoUrl(photo.path)}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 30vw, 180px"
                  className="object-cover"
                />
              ) : null}
              {i === 0 && (
                <span className="absolute left-0 top-0 bg-[var(--accent)] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--on-accent)]">
                  Leads
                </span>
              )}
              {!photo.approved && (
                <span className="absolute inset-x-0 bottom-0 bg-[var(--bg-primary)]/90 px-1.5 py-1 text-center text-[11px] leading-tight text-[var(--text-dim)]">
                  Being reviewed
                </span>
              )}
            </div>

            <div className="mt-1.5 flex items-center justify-between gap-1">
              <div className="flex gap-1">
                <Nudge label="Move left" onClick={() => move(i, -1)} disabled={i === 0 || pending}>
                  ←
                </Nudge>
                <Nudge
                  label="Move right"
                  onClick={() => move(i, 1)}
                  disabled={i === rows.length - 1 || pending}
                >
                  →
                </Nudge>
              </div>
              <button
                type="button"
                onClick={() => remove(photo.path)}
                disabled={pending || rows.length <= PHOTO_MIN}
                title={rows.length <= PHOTO_MIN ? `${PHOTO_MIN} photos minimum` : undefined}
                className="text-[13px] text-[var(--text-dim)] underline decoration-[1.5px] underline-offset-2 transition-colors hover:text-[var(--error)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-[var(--text-dim)]"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[14px] leading-relaxed text-[var(--text-dim)]">
        {PHOTO_MIN}&ndash;{PHOTO_MAX} photos. The first one leads your card.
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
          accept="image/jpeg,image/png,image/webp,image/avif"
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

function Nudge({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded border border-[var(--border)] px-2 py-0.5 text-[13px] transition-colors hover:border-[var(--text-dim)] disabled:opacity-30"
    >
      {children}
    </button>
  );
}
