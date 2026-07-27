"use client";

import { useState } from "react";
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

export interface StepProps {
  draft: ApplicationDraft;
  errors: FieldErrors;
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
 * Files are chosen client-side and their names submitted as `photoPaths`.
 * With Supabase provisioned this step uploads to the `photos` bucket first and
 * submits the returned storage paths instead — the draft never carries bytes.
 */
export function PhotosStep({ draft, errors }: StepProps) {
  const [files, setFiles] = useState<{ name: string; url: string }[]>(
    (draft.photoPaths ?? []).map((name) => ({ name, url: "" })),
  );

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).slice(0, PHOTO_MAX - files.length);
    setFiles((prev) =>
      [...prev, ...picked.map((f) => ({ name: f.name, url: URL.createObjectURL(f) }))].slice(
        0,
        PHOTO_MAX,
      ),
    );
    e.target.value = "";
  }

  function remove(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {files.map((file, i) => (
          <figure key={file.name} className="relative">
            <div className="aspect-[4/5] overflow-hidden border border-[var(--border)] bg-[var(--bg-secondary)]">
              {file.url ? (
                // A local object URL has no remote host for next/image to optimise.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={file.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center px-2 text-center text-[12px] text-[var(--text-dim)]">
                  {file.name}
                </div>
              )}
            </div>
            {i === 0 && (
              <figcaption className="mt-1.5 text-[12px] uppercase tracking-[0.1em] text-[var(--text-dim)]">
                First
              </figcaption>
            )}
            <button
              type="button"
              onClick={() => remove(file.name)}
              aria-label={`Remove ${file.name}`}
              className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-primary)]/90 text-[16px] leading-none text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-primary)]"
            >
              ×
            </button>
            <input type="hidden" name="photoPaths" value={file.name} />
          </figure>
        ))}

        {files.length < PHOTO_MAX && (
          <label className="flex aspect-[4/5] cursor-pointer flex-col items-center justify-center gap-1 border border-dashed border-[var(--border)] text-[13px] text-[var(--text-dim)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-text)]">
            <span aria-hidden="true" className="text-[22px] leading-none">
              +
            </span>
            Add
            <input type="file" accept="image/*" multiple onChange={onPick} className="sr-only" />
          </label>
        )}
      </div>

      <p className="text-[15px] text-[var(--text-dim)]">
        {files.length} of {PHOTO_MIN}&ndash;{PHOTO_MAX}. The first one leads your card.
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

export function SelfieStep({ draft, errors }: StepProps) {
  const [file, setFile] = useState<{ name: string; url: string } | null>(
    draft.selfiePath ? { name: draft.selfiePath, url: "" } : null,
  );

  return (
    <div className="space-y-6">
      {file ? (
        <div className="flex items-center gap-4 border border-[var(--border)] p-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
            {file.url && (
              // Local object URL; nothing for next/image to optimise.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={file.url} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px]">{file.name}</p>
            <button
              type="button"
              onClick={() => setFile(null)}
              className="mt-1 text-[14px] text-[var(--accent-text)] underline underline-offset-4"
            >
              Retake
            </button>
          </div>
          <input type="hidden" name="selfiePath" value={file.name} />
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
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) setFile({ name: picked.name, url: URL.createObjectURL(picked) });
            }}
          />
        </label>
      )}

      <FieldError id="selfie-error">{errors.selfie}</FieldError>

      <p className="text-[14px] leading-relaxed text-[var(--text-dim)]">{CONSENT.selfie}</p>
    </div>
  );
}
