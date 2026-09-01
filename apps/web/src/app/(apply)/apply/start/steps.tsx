"use client";

import { useEffect, useState } from "react";
import {
  GENDERS,
  GENDER_LABELS,
  INTEREST_MAX,
  INTEREST_MIN,
  INTEREST_TAGS,
  MIN_AGE,
  NEIGHBORHOOD_CLUSTERS,
  PHOTO_MAX,
  PHOTO_MIN,
  PROMPT_COUNT,
  interpolate,
} from "@noghost/config";
import { CONSENT, PROMPT_LIBRARY } from "@noghost/config/copy";
import type { ApplicationDraft, FieldErrors } from "@noghost/logic";
import { Chip, CheckboxRow, SelectField, TextArea, TextField } from "@/components/ui/field";
import { FieldError } from "@/components/ui/field";
import { publicPhotoUrl, uploadImage, uploadVoiceIntro } from "@/lib/upload";
import { VoicePlayer } from "@/components/ui/voice-player";
import { VoiceRecorder, type Recording } from "@/components/ui/voice-recorder";
import { VOICE_INTRO_MAX_MS } from "@/lib/voice";

export interface StepProps {
  draft: ApplicationDraft;
  errors: FieldErrors;
  /**
   * A signed link to an intro already on the draft, or null. Only `VoiceStep`
   * reads it; it is on the shared props because the funnel renders every step
   * through one `<Body>`.
   */
  voiceIntroUrl?: string | null;
}

const CLUSTER_LABELS: Record<keyof typeof NEIGHBORHOOD_CLUSTERS, string> = {
  "in-town": "In town",
  "otp-north": "OTP north",
  "otp-south": "OTP south & east",
};

export function PhoneStep({ draft, errors }: StepProps) {
  return (
    <div className="space-y-7">
      <TextField
        label="Mobile number"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="(404) 555-0134"
        defaultValue={draft.phone ?? ""}
        error={errors.phone}
      />
      <CheckboxRow name="consent" error={errors.consent} defaultChecked={Boolean(draft.consentedAt)}>
        {interpolate(CONSENT.application, { MIN_AGE })}
      </CheckboxRow>
      <p className="text-[14px] leading-relaxed text-[var(--text-dim)]">
        Your number is how you sign in. It&rsquo;s never shown to another member.
      </p>
    </div>
  );
}

export function VerifyStep({ draft, errors }: StepProps) {
  return (
    <div className="space-y-6">
      <TextField
        label="Six-digit code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="000000"
        className="text-center font-[family-name:var(--font-display)] text-[28px] tracking-[0.4em]"
        error={errors.code}
      />
      <p className="text-[14px] leading-relaxed text-[var(--text-dim)]">
        Sent to {draft.phone}. Wrong number? Go back a step.
      </p>
    </div>
  );
}

export function AboutStep({ draft, errors }: StepProps) {
  return (
    <div className="space-y-7">
      <TextField
        label="First name"
        name="firstName"
        autoComplete="given-name"
        maxLength={40}
        placeholder="Maya"
        defaultValue={draft.firstName ?? ""}
        error={errors.firstName}
      />

      <TextField
        label="Date of birth"
        name="birthdate"
        type="date"
        autoComplete="bday"
        defaultValue={draft.birthdate ?? ""}
        error={errors.birthdate}
        hint={`${MIN_AGE}+`}
      />

      <fieldset>
        <legend className="mb-3 text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
          I am
        </legend>
        <div className="flex flex-wrap gap-2">
          {GENDERS.map((g) => (
            <Chip
              key={g}
              type="radio"
              name="gender"
              value={g}
              label={GENDER_LABELS[g]}
              defaultChecked={draft.gender === g}
            />
          ))}
        </div>
        <FieldError id="gender-error">{errors.gender}</FieldError>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
          Looking to meet
        </legend>
        <div className="flex flex-wrap gap-2">
          {GENDERS.map((g) => (
            <Chip
              key={g}
              name="seeking"
              value={g}
              label={`${GENDER_LABELS[g]}${g === "nonbinary" ? "" : g === "man" ? "" : ""}`}
              defaultChecked={draft.seeking?.includes(g)}
            />
          ))}
        </div>
        <FieldError id="seeking-error">{errors.seeking}</FieldError>
      </fieldset>
    </div>
  );
}

export function PreferencesStep({ draft, errors }: StepProps) {
  return (
    <div className="space-y-7">
      <SelectField
        label="Your part of town"
        name="neighborhood"
        defaultValue={draft.neighborhood ?? ""}
        error={errors.neighborhood}
      >
        <option value="" disabled>
          Choose one
        </option>
        {(
          Object.entries(NEIGHBORHOOD_CLUSTERS) as [
            keyof typeof NEIGHBORHOOD_CLUSTERS,
            readonly string[],
          ][]
        ).map(([cluster, hoods]) => (
          <optgroup key={cluster} label={CLUSTER_LABELS[cluster]}>
            {hoods.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </optgroup>
        ))}
      </SelectField>

      <fieldset>
        <legend className="mb-3 text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
          Age range you&rsquo;re open to
        </legend>
        <div className="flex items-center gap-4">
          <TextField
            label="From"
            name="ageMin"
            type="number"
            min={MIN_AGE}
            max={99}
            defaultValue={draft.ageMin ?? MIN_AGE}
          />
          <span aria-hidden="true" className="mt-7 text-[var(--text-dim)]">
            &mdash;
          </span>
          <TextField
            label="To"
            name="ageMax"
            type="number"
            min={MIN_AGE}
            max={99}
            defaultValue={draft.ageMax ?? 45}
          />
        </div>
        <FieldError id="range-error">{errors.ageRange}</FieldError>
      </fieldset>

      <p className="text-[14px] leading-relaxed text-[var(--text-dim)]">
        Both people&rsquo;s ranges have to match for a drop to happen, so a narrow range means
        fewer nights with anyone in them.
      </p>
    </div>
  );
}

export function InterestsStep({ draft, errors }: StepProps) {
  const [count, setCount] = useState(draft.interests?.length ?? 0);

  return (
    <div className="space-y-6">
      <div
        className="flex flex-wrap gap-2"
        onChange={(e) => {
          const form = (e.currentTarget as HTMLElement).querySelectorAll<HTMLInputElement>(
            'input[name="interests"]:checked',
          );
          setCount(form.length);
        }}
      >
        {INTEREST_TAGS.map((tag) => (
          <Chip
            key={tag}
            name="interests"
            value={tag}
            label={tag}
            defaultChecked={draft.interests?.includes(tag)}
          />
        ))}
      </div>

      <p
        className={
          count >= INTEREST_MIN && count <= INTEREST_MAX
            ? "text-[15px] text-[var(--sage-text)]"
            : "text-[15px] text-[var(--text-dim)]"
        }
      >
        {count} of {INTEREST_MIN}&ndash;{INTEREST_MAX} chosen
      </p>
      <FieldError id="interests-error">{errors.interests}</FieldError>
    </div>
  );
}

/**
 * Photos.
 *
 * Each file uploads to the `photos` bucket as soon as it's chosen, and only
 * the returned storage path is submitted. A photo that hasn't finished
 * uploading contributes no hidden input, so the server can never receive a
 * path that doesn't exist in Storage.
 */
interface PendingPhoto {
  /** Stable across re-renders; filenames are not unique. */
  key: string;
  label: string;
  /** Local object URL while uploading, CDN URL once stored. */
  preview: string;
  path: string | null;
  error: string | null;
}

export function PhotosStep({ draft, errors }: StepProps) {
  const [photos, setPhotos] = useState<PendingPhoto[]>(() =>
    (draft.photoPaths ?? []).map((path, i) => ({
      key: `restored-${i}-${path}`,
      label: path.split("/").pop() ?? path,
      preview: publicPhotoUrl(path),
      path,
      error: null,
    })),
  );

  const stored = photos.filter((p) => p.path !== null).length;
  const uploading = photos.filter((p) => p.path === null && p.error === null).length;

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).slice(0, PHOTO_MAX - photos.length);
    e.target.value = "";

    for (const file of picked) {
      const key = crypto.randomUUID();
      setPhotos((prev) =>
        prev.length >= PHOTO_MAX
          ? prev
          : [
              ...prev,
              {
                key,
                label: file.name,
                preview: URL.createObjectURL(file),
                path: null,
                error: null,
              },
            ],
      );

      void uploadImage("photos", file)
        .then((path) =>
          setPhotos((prev) => prev.map((p) => (p.key === key ? { ...p, path } : p))),
        )
        .catch((cause: unknown) =>
          setPhotos((prev) =>
            prev.map((p) =>
              p.key === key
                ? { ...p, error: cause instanceof Error ? cause.message : "Upload failed." }
                : p,
            ),
          ),
        );
    }
  }

  function remove(key: string) {
    setPhotos((prev) => prev.filter((p) => p.key !== key));
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {photos.map((photo, i) => (
          <figure key={photo.key} className="relative">
            <div className="relative aspect-[4/5] overflow-hidden border border-[var(--border)] bg-[var(--bg-secondary)]">
              {photo.preview ? (
                // Mixed local object URLs and CDN URLs in one list, at thumbnail
                // size, for the member's own six photos. next/image earns its
                // keep on the drop (BACKEND.md layer 2), not here.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo.preview}
                  alt=""
                  className={
                    photo.path
                      ? "h-full w-full object-cover"
                      : "h-full w-full object-cover opacity-50"
                  }
                />
              ) : (
                <div className="flex h-full items-center justify-center px-2 text-center text-[12px] text-[var(--text-dim)]">
                  {photo.label}
                </div>
              )}

              {!photo.path && !photo.error && (
                <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-primary)]/60 text-[12px] uppercase tracking-[0.1em] text-[var(--text-dim)]">
                  Uploading
                </div>
              )}
            </div>

            {i === 0 && photo.path && (
              <figcaption className="mt-1.5 text-[12px] uppercase tracking-[0.1em] text-[var(--text-dim)]">
                First
              </figcaption>
            )}
            {photo.error && (
              <p role="alert" className="mt-1.5 text-[12px] leading-snug text-[var(--error)]">
                {photo.error}
              </p>
            )}

            <button
              type="button"
              onClick={() => remove(photo.key)}
              aria-label={`Remove ${photo.label}`}
              className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-primary)]/90 text-[16px] leading-none text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-primary)]"
            >
              ×
            </button>

            {/* Only a stored path is submittable. */}
            {photo.path && <input type="hidden" name="photoPaths" value={photo.path} />}
          </figure>
        ))}

        {photos.length < PHOTO_MAX && (
          <label className="flex aspect-[4/5] cursor-pointer flex-col items-center justify-center gap-1 border border-dashed border-[var(--border)] text-[13px] text-[var(--text-dim)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-text)]">
            <span aria-hidden="true" className="text-[22px] leading-none">
              +
            </span>
            Add
            <input type="file" accept="image/*" multiple onChange={onPick} className="sr-only" />
          </label>
        )}
      </div>

      <p aria-live="polite" className="text-[15px] text-[var(--text-dim)]">
        {uploading > 0
          ? `${stored} of ${PHOTO_MIN}–${PHOTO_MAX}. ${uploading} still uploading…`
          : `${stored} of ${PHOTO_MIN}–${PHOTO_MAX}. The first one leads your card.`}
      </p>
      <FieldError id="photos-error">{errors.photos}</FieldError>
    </div>
  );
}

export function PromptsStep({ draft, errors }: StepProps) {
  const [chosen, setChosen] = useState<string[]>(
    draft.prompts?.map((p) => p.prompt_id) ?? [],
  );

  function toggle(id: string) {
    setChosen((prev) =>
      prev.includes(id)
        ? prev.filter((p) => p !== id)
        : prev.length < PROMPT_COUNT
          ? [...prev, id]
          : prev,
    );
  }

  const answerFor = (id: string) => draft.prompts?.find((p) => p.prompt_id === id)?.answer ?? "";

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap gap-2">
        {PROMPT_LIBRARY.map((prompt) => {
          const active = chosen.includes(prompt.id);
          return (
            <button
              key={prompt.id}
              type="button"
              onClick={() => toggle(prompt.id)}
              aria-pressed={active}
              disabled={!active && chosen.length >= PROMPT_COUNT}
              className={
                active
                  ? "rounded-md border border-[var(--accent)] bg-[var(--accent)] px-3.5 py-2 text-left text-[14px] text-[var(--on-accent)]"
                  : "rounded-md border border-[var(--border)] px-3.5 py-2 text-left text-[14px] transition-colors hover:border-[var(--text-dim)] disabled:cursor-not-allowed disabled:opacity-40"
              }
            >
              {prompt.text}
            </button>
          );
        })}
      </div>

      <p className="text-[15px] text-[var(--text-dim)]">
        {chosen.length} of {PROMPT_COUNT} chosen
      </p>
      <FieldError id="prompts-error">{errors.prompts}</FieldError>

      <div className="space-y-6">
        {chosen.map((id) => {
          const prompt = PROMPT_LIBRARY.find((p) => p.id === id);
          if (!prompt) return null;
          return (
            <div key={id}>
              <input type="hidden" name="promptId" value={id} />
              <TextArea
                label={prompt.text}
                name={`answer_${id}`}
                maxLength={280}
                defaultValue={answerFor(id)}
                error={errors[id]}
                placeholder="Something only you would say."
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Selfie.
 *
 * Note the asymmetry with photos: a selfie restored from the draft shows a
 * confirmation, never a thumbnail. `verification-selfies` is private and has
 * no member SELECT policy at all — spec §9.8, "review-team eyes only" — so
 * there is no URL to render even for the person who uploaded it. That's the
 * promise working, not a gap.
 */
export function SelfieStep({ draft, errors }: StepProps) {
  const [selfie, setSelfie] = useState<{ label: string; preview: string } | null>(
    draft.selfiePath ? { label: "Selfie on file", preview: "" } : null,
  );
  const [path, setPath] = useState<string | null>(draft.selfiePath ?? null);
  const [uploading, setUploading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;

    setSelfie({ label: picked.name, preview: URL.createObjectURL(picked) });
    setPath(null);
    setFailure(null);
    setUploading(true);

    void uploadImage("verification-selfies", picked)
      .then(setPath)
      .catch((cause: unknown) =>
        setFailure(cause instanceof Error ? cause.message : "Upload failed."),
      )
      .finally(() => setUploading(false));
  }

  function retake() {
    setSelfie(null);
    setPath(null);
    setFailure(null);
  }

  return (
    <div className="space-y-6">
      {selfie ? (
        <div className="flex items-center gap-4 border border-[var(--border)] p-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--bg-secondary)]">
            {selfie.preview ? (
              // Local object URL; nothing for next/image to optimise.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selfie.preview}
                alt=""
                className={uploading ? "h-full w-full object-cover opacity-50" : "h-full w-full object-cover"}
              />
            ) : (
              <span aria-hidden="true" className="text-[22px] text-[var(--sage-text)]">
                ✓
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px]" aria-live="polite">
              {uploading ? "Uploading…" : failure ? "Upload failed" : selfie.label}
            </p>
            <button
              type="button"
              onClick={retake}
              className="mt-1 text-[14px] text-[var(--accent-text)] underline underline-offset-4"
            >
              Retake
            </button>
          </div>
          {path && <input type="hidden" name="selfiePath" value={path} />}
        </div>
      ) : (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-[var(--border)] px-6 py-12 text-center transition-colors hover:border-[var(--accent)]">
          <span className="text-[16px] font-medium">Take a selfie</span>
          <span className="text-[14px] text-[var(--text-dim)]">
            Front camera, good light, no sunglasses
          </span>
          <input
            type="file"
            accept="image/*"
            capture="user"
            className="sr-only"
            onChange={onPick}
          />
        </label>
      )}

      {failure && (
        <p role="alert" className="text-[14px] leading-snug text-[var(--error)]">
          {failure}
        </p>
      )}
      <FieldError id="selfie-error">{errors.selfie}</FieldError>

      <p className="text-[14px] leading-relaxed text-[var(--text-dim)]">{CONSENT.selfie}</p>
    </div>
  );
}

/**
 * The optional 30s intro — §7.2's "optional 30s voice intro".
 *
 * The only step in the funnel nobody has to do, and it says so twice: in the
 * skip affordance and in what the Continue button does when the field is empty.
 * `validateStep` returns ok for this step whatever the draft holds, so an empty
 * one moves on exactly like a filled one.
 *
 * Thirty seconds rather than the chat note's sixty. A card in somebody's drop
 * is being skimmed, and the difference between a voice you can place and a
 * monologue is roughly the length of a sentence you would say out loud.
 */
export function VoiceStep({ draft, errors, voiceIntroUrl }: StepProps) {
  const [path, setPath] = useState<string | undefined>(draft.voiceIntroPath);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    return () => URL.revokeObjectURL(recording.url);
  }, [recording]);

  async function keep(next: Recording) {
    setRecording(next);
    setError(null);
    setBusy(true);
    try {
      setPath(await uploadVoiceIntro(next.blob));
    } catch (cause) {
      setPath(undefined);
      setError(cause instanceof Error ? cause.message : "That upload didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Submitted whether or not it is set — an empty value clears a previous
          recording, which is how "record another" and "remove" both work. */}
      <input type="hidden" name="voiceIntroPath" value={path ?? ""} />

      {recording || path ? (
        <div className="space-y-3">
          {/*
            A recording made in this session plays from its object URL; one
            carried in on a resumed draft plays from the link the server signed.
            Duration is only known for the former — the player measures the
            other once its metadata loads.
          */}
          <VoicePlayer
            src={recording?.url ?? voiceIntroUrl ?? null}
            durationMs={recording?.durationMs ?? null}
            mine
            className="max-w-full"
          />
          {busy && <p className="text-[14px] text-[var(--text-dim)]">Saving it…</p>}
          {!busy && path && (
            <p className="text-[14px] text-[var(--success)]">Saved. It plays on your card.</p>
          )}
          <button
            type="button"
            onClick={() => {
              setRecording(null);
              setPath(undefined);
              setError(null);
            }}
            className="text-[15px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
          >
            Record a different one
          </button>
        </div>
      ) : (
        <VoiceRecorder onRecorded={keep} disabled={busy} maxMs={VOICE_INTRO_MAX_MS} />
      )}

      {(error ?? errors.voiceIntroPath) && (
        <p role="alert" className="text-[15px] leading-snug text-[var(--error)]">
          {error ?? errors.voiceIntroPath}
        </p>
      )}

      <p className="text-[15px] leading-relaxed text-[var(--text-dim)]">
        Thirty seconds, and entirely optional &mdash; Continue skips it. It sits on your card next
        to your name, so people can hear you before they decide whether to write.
      </p>
    </div>
  );
}
