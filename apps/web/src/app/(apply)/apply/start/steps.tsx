"use client";

import { useEffect, useState } from "react";
import {
  AGE_RANGE_TOP,
  GENDERS,
  GENDER_LABELS,
  INTEREST_MAX,
  INTEREST_MIN,
  INTEREST_TAGS,
  MIN_AGE,
  PHOTO_MAX,
  PHOTO_MIN,
  PROMPT_COUNT,
  OTP_MAX_DIGITS,
  interpolate,
} from "@noghost/config";
import { CONSENT, PROMPT_LIBRARY } from "@noghost/config/copy";
import type { ApplicationDraft, FieldErrors } from "@noghost/logic";
import { Chip, CheckboxRow, TextArea, TextField } from "@/components/ui/field";
import { FieldError } from "@/components/ui/field";
import { AgeRange } from "@/components/ui/age-range";
import { LocationField } from "@/components/ui/location-field";
import { cn } from "@/lib/utils";
import { publicPhotoUrl, uploadImage, uploadVoiceIntro } from "@/lib/upload";
import { screenPhoto } from "./photo-actions";
import { VoicePlayer } from "@/components/ui/voice-player";
import { LivenessCapture } from "@/components/ui/liveness-capture";
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
      {/*
        §7.4's "email captured at application for receipts/comms". It sits on
        this step rather than a screen of its own because it answers the same
        question as the number above it — how we reach you — and the two
        together are what the consent line below is consenting to.
      */}
      <TextField
        label="Email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        defaultValue={draft.email ?? ""}
        error={errors.email}
      />
      <CheckboxRow name="consent" error={errors.consent} defaultChecked={Boolean(draft.consentedAt)}>
        {interpolate(CONSENT.application, { MIN_AGE })}
      </CheckboxRow>
      <p className="text-[14px] leading-relaxed text-[var(--text-dim)]">
        Your number is how you sign in &mdash; it&rsquo;s never shown to another member. Your
        email is for your receipt and your admission decision, nothing else.
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
        maxLength={OTP_MAX_DIGITS}
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
      {/*
       * A coordinate and a radius, where this used to be a dropdown of forty
       * Atlanta neighbourhood names. The list only ever worked in the city it
       * described, and the drop now scores on real distance (0028).
       */}
      <LocationField
        defaultLat={draft.point?.lat}
        defaultLng={draft.point?.lng}
        defaultLabel={draft.placeLabel}
        defaultRadiusKm={draft.travelRadiusKm}
        error={errors.location}
      />

      {/*
       * Optional, and free text. This is the line under somebody's name on
       * their card — a person describing where they are, not the product
       * locating them.
       */}
      <TextField
        label="Your part of town"
        name="neighborhood"
        placeholder="Old Fourth Ward"
        hint="optional, shown on your card"
        maxLength={60}
        defaultValue={draft.neighborhood ?? ""}
        error={errors.neighborhood}
      />

      <fieldset>
        <legend className="mb-3 text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
          Age range you&rsquo;re open to
        </legend>
        <AgeRange
          min={MIN_AGE}
          max={AGE_RANGE_TOP}
          defaultMin={draft.ageMin ?? MIN_AGE}
          defaultMax={draft.ageMax ?? 45}
        />
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
  /*
   * Controlled, where it used to count checked inputs after the fact. Counting
   * cannot stop an eleventh from being checked — the validator caught it two
   * screens later, which is the worst moment to learn you picked too many.
   */
  const [chosen, setChosen] = useState<string[]>(draft.interests ?? []);
  const full = chosen.length >= INTEREST_MAX;

  const toggle = (tag: string) =>
    setChosen((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length >= INTEREST_MAX ? prev : [...prev, tag],
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {INTEREST_TAGS.map((tag) => (
          <Chip
            key={tag}
            name="interests"
            value={tag}
            label={tag}
            checked={chosen.includes(tag)}
            onChange={() => toggle(tag)}
            // Already-picked tags stay clickable so the only way out of a full
            // set is not "start again".
            disabled={full && !chosen.includes(tag)}
          />
        ))}
      </div>

      <p
        aria-live="polite"
        className={
          chosen.length >= INTEREST_MIN
            ? "text-[15px] text-[var(--sage-text)]"
            : "text-[15px] text-[var(--text-dim)]"
        }
      >
        {chosen.length < INTEREST_MIN
          ? `${chosen.length} chosen \u2014 ${INTEREST_MIN - chosen.length} more to go`
          : full
            ? `${INTEREST_MAX} of ${INTEREST_MAX} \u2014 that's the lot`
            : `${chosen.length} of up to ${INTEREST_MAX}`}
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
  /*
   * Sits outside the photo list on purpose: the photo it refers to no longer
   * exists, so there is no row to attach it to. One slot, replaced each time,
   * because somebody picking six files at once should be told about the last
   * refusal rather than reading a stack of them.
   */
  const [refused, setRefused] = useState<string | null>(null);
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

      /*
       * Uploaded, then screened, before it counts as one of their photos.
       *
       * Moderation used to run at filing, five steps later, so an explicit
       * photo was accepted into a publicly readable bucket and the person who
       * uploaded it was never told. A refusal now happens here, with the picker
       * still open, and `screenPhoto` has already deleted the file from storage
       * by the time this resolves — so removing it from the list is the UI
       * catching up with the bucket rather than hiding something still there.
       */
      void uploadImage("photos", file)
        .then(async (path) => {
          setPhotos((prev) => prev.map((p) => (p.key === key ? { ...p, path } : p)));

          const screened = await screenPhoto(path);
          if (screened.verdict !== "refuse") return;

          setPhotos((prev) => prev.filter((p) => p.key !== key));
          setRefused(
            screened.reason ?? "That photo can’t be used here. Pick a different one.",
          );
        })
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
        {/*
          "3 of 6", not "3 of 3–6". A range in a progress counter reads as two
          numbers to hit rather than one; the minimum belongs in the prompt
          below, not in the tally.
        */}
        {uploading > 0
          ? `${stored} of ${PHOTO_MAX}. ${uploading} still uploading…`
          : stored < PHOTO_MIN
            ? `${stored} of ${PHOTO_MAX} — ${PHOTO_MIN - stored} more needed.`
            : `${stored} of ${PHOTO_MAX}. The first one leads your card.`}
      </p>
      {refused && (
        <p
          role="alert"
          className="border-l-2 border-[var(--error)] pl-3 text-[15px] leading-snug text-[var(--error)]"
        >
          {refused}
        </p>
      )}

      <FieldError id="photos-error">{errors.photos}</FieldError>
    </div>
  );
}

export function PromptsStep({ draft, errors }: StepProps) {
  const [chosen, setChosen] = useState<string[]>(
    draft.prompts?.map((p) => p.prompt_id) ?? [],
  );

  const toggle = (id: string) =>
    setChosen((prev) =>
      prev.includes(id)
        ? prev.filter((p) => p !== id)
        : prev.length >= PROMPT_COUNT
          ? prev
          : [...prev, id],
    );

  const answerFor = (id: string) => draft.prompts?.find((p) => p.prompt_id === id)?.answer ?? "";
  const full = chosen.length >= PROMPT_COUNT;

  return (
    <div className="space-y-5">
      {/*
       * One question per row, with its answer opening underneath it.
       *
       * The first version put every prompt in a wrapped grid and collected the
       * three answer boxes in a block at the bottom. That asks somebody to hold
       * "which one was the third one again" in their head while they type, and
       * on a phone the question they are answering is off the top of the screen
       * by the second line.
       */}
      <ul className="space-y-2">
        {PROMPT_LIBRARY.map((prompt) => {
          const active = chosen.includes(prompt.id);
          return (
            <li key={prompt.id}>
              <button
                type="button"
                onClick={() => toggle(prompt.id)}
                aria-pressed={active}
                aria-controls={active ? `answer_${prompt.id}` : undefined}
                disabled={!active && full}
                className={cn(
                  "w-full rounded-md border px-4 py-3 text-left text-[15px] transition-colors",
                  active
                    ? "border-[var(--accent)] bg-[var(--accent)]/8 font-medium text-[var(--text-primary)]"
                    : "border-[var(--border)] hover:border-[var(--text-dim)] disabled:cursor-not-allowed disabled:opacity-40",
                )}
              >
                {prompt.text}
              </button>

              {active && (
                <div id={`answer_${prompt.id}`} className="mt-2 pl-4">
                  <input type="hidden" name="promptId" value={prompt.id} />
                  <TextArea
                    label="Your answer"
                    name={`answer_${prompt.id}`}
                    maxLength={280}
                    defaultValue={answerFor(prompt.id)}
                    error={errors[prompt.id]}
                    placeholder="Something only you would say."
                    rows={3}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p aria-live="polite" className="text-[15px] text-[var(--text-dim)]">
        {chosen.length} of {PROMPT_COUNT} chosen
      </p>
      <FieldError id="prompts-error">{errors.prompts}</FieldError>
    </div>
  );
}

export function SelfieStep({ draft, errors }: StepProps) {
  return <LivenessCapture existingPath={draft.selfiePath} error={errors.selfie} />;
}

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
