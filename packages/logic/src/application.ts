import {
  INTEREST_MAX,
  INTEREST_MIN,
  MIN_AGE,
  NEIGHBORHOODS,
  PHOTO_MAX,
  PHOTO_MIN,
  PROMPT_COUNT,
} from "@noghost/config";
import { PROMPT_LIBRARY } from "@noghost/config/copy";
import type { Gender } from "@noghost/types";
import { ageOn } from "./time";

/**
 * Application funnel rules — spec §7.2 onboarding, §9.8 consent.
 *
 * Pure, like every other mechanic. The client runs these for inline feedback
 * and the server actions run the identical functions before writing anything,
 * so the browser is never the thing enforcing eligibility.
 */

export const APPLICATION_STEPS = [
  "phone",
  "verify",
  "about",
  "preferences",
  "interests",
  "photos",
  "prompts",
  // Optional, and still its own step (§7.2). Folding it into the prompts screen
  // would make the one thing here that nobody has to do look like a field they
  // forgot, and `validateStep` returning ok is what lets Continue skip it.
  "voice",
  "selfie",
] as const;

export type ApplicationStep = (typeof APPLICATION_STEPS)[number];

export interface ApplicationDraft {
  phone?: string;
  phoneVerifiedAt?: string;
  firstName?: string;
  birthdate?: string;
  gender?: Gender;
  seeking?: Gender[];
  neighborhood?: string;
  ageMin?: number;
  ageMax?: number;
  interests?: string[];
  /** Storage paths, never image bytes. */
  photoPaths?: string[];
  prompts?: { prompt_id: string; answer: string }[];
  /** Receipts and lifecycle mail (§7.4). Never a sign-in credential. */
  email?: string;
  /** Optional 30s intro (§7.2). A storage path, never audio bytes. */
  voiceIntroPath?: string;
  /**
   * When they were offered the intro, whether or not they recorded one.
   *
   * Recording is optional; being asked is not. Without this the step validates
   * on an empty draft, `nextIncompleteStep` walks straight past it, and anyone
   * who closes the tab before finishing is never offered a voice intro at all.
   */
  voiceSeenAt?: string;
  selfiePath?: string;
  consentedAt?: string;
}

export type FieldErrors = Record<string, string>;
export type StepResult = { ok: true } | { ok: false; errors: FieldErrors };

const ok: StepResult = { ok: true };
const fail = (errors: FieldErrors): StepResult => ({ ok: false, errors });

/** E.164, matching the `e164` domain the schema enforces. */
export const E164 = /^\+[1-9]\d{1,14}$/;

/**
 * Deliberately loose. The only thing worth refusing here is an address that
 * cannot be one — a typo'd domain is caught by the mail bouncing, and a
 * stricter pattern rejects real addresses (apostrophes, plus tags, new TLDs)
 * on the first screen of an application.
 */
export const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

export function validatePhone(draft: ApplicationDraft): StepResult {
  if (!draft.phone || !E164.test(draft.phone)) {
    return fail({ phone: "Enter a phone number we can text, including the country code." });
  }
  /*
   * Required, not optional. §7.4 says email is "captured at application for
   * receipts/comms", and every §9.5 lifecycle mail — including the one telling
   * somebody they got in — has nowhere to go without it.
   */
  if (!draft.email || !EMAIL_SHAPE.test(draft.email.trim())) {
    return fail({ email: "We need an email for your receipt and your admission decision." });
  }
  if (!draft.consentedAt) {
    return fail({ consent: "Please confirm the three statements above." });
  }
  return ok;
}

export function validateVerify(draft: ApplicationDraft): StepResult {
  return draft.phoneVerifiedAt
    ? ok
    : fail({ code: "That code didn't match. Check the code we sent, or ask for a new one." });
}

export function validateAbout(draft: ApplicationDraft, now: string): StepResult {
  const errors: FieldErrors = {};

  const name = draft.firstName?.trim() ?? "";
  if (name.length < 1 || name.length > 40) {
    errors.firstName = "First name only, up to 40 characters.";
  }

  if (!draft.birthdate) {
    errors.birthdate = "We need your date of birth.";
  } else {
    const age = ageOn(draft.birthdate, now);
    if (Number.isNaN(age)) {
      errors.birthdate = "That date doesn't look right.";
    } else if (age < MIN_AGE) {
      // A curation choice for Season One, not a legal minimum (spec §9.8).
      errors.birthdate = `Season One is ${MIN_AGE} and over. Join the waitlist and we'll tell you when that changes.`;
    } else if (age > 100) {
      errors.birthdate = "That date doesn't look right.";
    }
  }

  if (!draft.gender) errors.gender = "Pick one.";
  if (!draft.seeking || draft.seeking.length === 0) {
    errors.seeking = "Pick at least one.";
  }

  return Object.keys(errors).length ? fail(errors) : ok;
}

export function validatePreferences(draft: ApplicationDraft, now: string): StepResult {
  const errors: FieldErrors = {};

  if (!draft.neighborhood || !NEIGHBORHOODS.includes(draft.neighborhood)) {
    errors.neighborhood = "Pick the area you actually spend your time in.";
  }

  const min = draft.ageMin;
  const max = draft.ageMax;

  if (min === undefined || max === undefined) {
    errors.ageRange = "Set an age range.";
  } else if (min < MIN_AGE) {
    errors.ageRange = `The lower bound can't go below ${MIN_AGE}.`;
  } else if (max < min) {
    errors.ageRange = "The upper bound has to be at least the lower one.";
  } else if (draft.birthdate) {
    // A range that excludes your own age means every match must be one-sided,
    // and the drop's mutual filter would return nobody. Better to say so here
    // than to hand someone eight weeks of quiet nights.
    const age = ageOn(draft.birthdate, now);
    if (age < min || age > max) {
      errors.ageRange =
        "Heads up: your own age falls outside this range, so matching will be one-directional and your drops may be very thin.";
    }
  }

  return Object.keys(errors).length ? fail(errors) : ok;
}

export function validateInterests(draft: ApplicationDraft): StepResult {
  const count = draft.interests?.length ?? 0;
  if (count < INTEREST_MIN) {
    return fail({ interests: `Pick at least ${INTEREST_MIN}. ${count} so far.` });
  }
  if (count > INTEREST_MAX) {
    return fail({ interests: `Pick at most ${INTEREST_MAX}.` });
  }
  return ok;
}

export function validatePhotos(draft: ApplicationDraft): StepResult {
  const count = draft.photoPaths?.length ?? 0;
  if (count < PHOTO_MIN) {
    return fail({ photos: `Add at least ${PHOTO_MIN} photos. ${count} so far.` });
  }
  if (count > PHOTO_MAX) {
    return fail({ photos: `${PHOTO_MAX} photos maximum.` });
  }
  return ok;
}

const PROMPT_ANSWER_MIN = 8;
const PROMPT_ANSWER_MAX = 280;

export function validatePrompts(draft: ApplicationDraft): StepResult {
  const answered = (draft.prompts ?? []).filter((p) => p.answer.trim().length > 0);

  if (answered.length !== PROMPT_COUNT) {
    return fail({ prompts: `Answer exactly ${PROMPT_COUNT}. ${answered.length} so far.` });
  }

  const ids = new Set(answered.map((p) => p.prompt_id));
  if (ids.size !== answered.length) {
    return fail({ prompts: "Pick three different prompts." });
  }
  for (const id of ids) {
    if (!PROMPT_LIBRARY.some((p) => p.id === id)) {
      return fail({ prompts: "One of those prompts isn't in the library." });
    }
  }

  for (const p of answered) {
    const len = p.answer.trim().length;
    if (len < PROMPT_ANSWER_MIN) {
      return fail({
        [p.prompt_id]: "A few more words — this is what someone replies to.",
      });
    }
    if (len > PROMPT_ANSWER_MAX) {
      return fail({ [p.prompt_id]: `Keep it under ${PROMPT_ANSWER_MAX} characters.` });
    }
  }

  return ok;
}

/**
 * The one step nobody has to complete — but everybody has to be shown.
 *
 * Satisfied by either a recording or the act of passing through, so `Continue`
 * on an empty step is a real answer rather than a skipped screen. The
 * distinction matters on resume: this is what stops `nextIncompleteStep`
 * jumping from prompts to the selfie and quietly retiring the feature for
 * anybody who finishes their application in two sittings.
 *
 * The message is never rendered. `applyStep` stamps `voiceSeenAt` before the
 * validator runs, so submitting this step always passes; the failure exists
 * only so the resume logic has something to stop on.
 */
export function validateVoice(draft: ApplicationDraft): StepResult {
  return draft.voiceIntroPath || draft.voiceSeenAt
    ? ok
    : fail({ voiceIntroPath: "Record something or press Continue — either one is an answer." });
}

export function validateSelfie(draft: ApplicationDraft): StepResult {
  return draft.selfiePath
    ? ok
    : fail({ selfie: "We need one selfie to confirm you're you." });
}

/** Runs the validator for a single step. */
export function validateStep(
  step: ApplicationStep,
  draft: ApplicationDraft,
  now: string,
): StepResult {
  switch (step) {
    case "phone":
      return validatePhone(draft);
    case "verify":
      return validateVerify(draft);
    case "about":
      return validateAbout(draft, now);
    case "preferences":
      return validatePreferences(draft, now);
    case "interests":
      return validateInterests(draft);
    case "photos":
      return validatePhotos(draft);
    case "prompts":
      return validatePrompts(draft);
    case "voice":
      return validateVoice(draft);
    case "selfie":
      return validateSelfie(draft);
  }
}

/**
 * The first step that isn't satisfied — where someone lands when they come
 * back to a half-finished application. Returns null when the draft is
 * submittable.
 */
export function nextIncompleteStep(
  draft: ApplicationDraft,
  now: string,
): ApplicationStep | null {
  for (const step of APPLICATION_STEPS) {
    if (!validateStep(step, draft, now).ok) return step;
  }
  return null;
}

export function isSubmittable(draft: ApplicationDraft, now: string): boolean {
  return nextIncompleteStep(draft, now) === null;
}

/**
 * Steps nobody has to *complete*. They still have to be reached — see
 * `validateVoice` — and they still count in "Step 8 of 9", because they are
 * real screens. They do not count in the progress ratio, which is a claim about
 * how much work is left rather than how many screens remain.
 */
export const OPTIONAL_STEPS: readonly ApplicationStep[] = ["voice"];

const REQUIRED_STEPS = APPLICATION_STEPS.filter((step) => !OPTIONAL_STEPS.includes(step));

/**
 * How far through the required work they are, 0 to 1.
 *
 * Optional steps are excluded rather than counted as done. Recording an intro
 * is not work the applicant owes, so a bar that moves when they do it — or
 * stalls at 8/9 when they decline — would be measuring the wrong thing. Nothing
 * renders this today; the funnel's own indicator is positional.
 */
export function completionRatio(draft: ApplicationDraft, now: string): number {
  const done = REQUIRED_STEPS.filter((s) => validateStep(s, draft, now).ok).length;
  return done / REQUIRED_STEPS.length;
}

/**
 * Normalises a phone number to E.164, assuming +1 when no country code is
 * given. Atlanta Season One is a US cohort; the assumption is stated rather
 * than hidden so a non-US number still validates or fails visibly.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return E164.test(digits) ? digits : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
