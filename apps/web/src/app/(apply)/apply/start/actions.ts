"use server";

import { redirect } from "next/navigation";
import { usingSeedData } from "@noghost/config/env";
import {
  normalizePhone,
  validateStep,
  type ApplicationDraft,
  type ApplicationStep,
  type FieldErrors,
} from "@noghost/logic";
import type { Gender } from "@noghost/types";
import { readDraft, writeDraft } from "@/lib/application-draft";

export interface StepState {
  errors?: FieldErrors;
  /** Set when a step succeeded, so the client can advance. */
  completed?: ApplicationStep;
  notice?: string;
  /**
   * The merged draft, echoed back on every outcome.
   *
   * React 19 resets an uncontrolled form after its action runs, so without
   * this the fields a member already filled come back blank — fix the one
   * field the error named and you silently lose the others on the same step.
   */
  draft?: ApplicationDraft;
  /**
   * Increments once per submission. The client keys the step body on it so the
   * remount and the fresh draft arrive in the same state update — a separate
   * client-side counter renders first, against the stale draft.
   */
  version?: number;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
};
const all = (fd: FormData, key: string) =>
  fd.getAll(key).filter((v): v is string => typeof v === "string");
const num = (fd: FormData, key: string) => {
  const v = Number.parseInt(str(fd, key), 10);
  return Number.isFinite(v) ? v : undefined;
};

/**
 * Merges one step's fields into the draft.
 *
 * Reads only the fields that step owns, so a replayed or tampered submission
 * can't reach across and rewrite an earlier answer.
 */
function applyStep(step: ApplicationStep, draft: ApplicationDraft, fd: FormData): ApplicationDraft {
  switch (step) {
    case "phone":
      return {
        ...draft,
        phone: normalizePhone(str(fd, "phone")) ?? undefined,
        consentedAt: str(fd, "consent") === "on" ? new Date().toISOString() : undefined,
        // Changing the number invalidates any previous verification.
        phoneVerifiedAt: undefined,
      };

    case "verify": {
      const code = str(fd, "code");
      // Seed mode accepts any six digits and says so on screen. The real check
      // is Supabase phone auth (`verifyOtp`), wired in Phase 2.
      const accepted = usingSeedData() ? /^\d{6}$/.test(code) : false;
      return { ...draft, phoneVerifiedAt: accepted ? new Date().toISOString() : undefined };
    }

    case "about":
      return {
        ...draft,
        firstName: str(fd, "firstName"),
        birthdate: str(fd, "birthdate"),
        gender: (str(fd, "gender") || undefined) as Gender | undefined,
        seeking: all(fd, "seeking") as Gender[],
      };

    case "preferences":
      return {
        ...draft,
        neighborhood: str(fd, "neighborhood"),
        ageMin: num(fd, "ageMin"),
        ageMax: num(fd, "ageMax"),
      };

    case "interests":
      return { ...draft, interests: all(fd, "interests") };

    case "photos":
      // Paths only. In seed mode these are the chosen filenames; with Supabase
      // they are `photos/<user_id>/<uuid>.webp` returned by the upload.
      return { ...draft, photoPaths: all(fd, "photoPaths") };

    case "prompts": {
      const ids = all(fd, "promptId");
      return {
        ...draft,
        prompts: ids
          .map((id) => ({ prompt_id: id, answer: str(fd, `answer_${id}`) }))
          .filter((p) => p.answer.length > 0),
      };
    }

    case "selfie":
      return { ...draft, selfiePath: str(fd, "selfiePath") || undefined };
  }
}

export async function submitStep(prev: StepState, formData: FormData): Promise<StepState> {
  const version = (prev.version ?? 0) + 1;
  const step = str(formData, "step") as ApplicationStep;
  const draft = await readDraft();
  const next = applyStep(step, draft, formData);

  const now = new Date().toISOString();
  const result = validateStep(step, next, now);

  if (!result.ok) {
    // Persist anyway: a failed step should not lose what someone just typed.
    await writeDraft(next);
    return { errors: result.errors, draft: next, version };
  }

  await writeDraft(next);

  if (step === "phone") {
    return {
      completed: step,
      draft: next,
      version,
      notice: usingSeedData()
        ? "Seed mode — no SMS was sent. Any six digits will do."
        : `Code sent to ${next.phone}.`,
    };
  }

  return { completed: step, draft: next, version };
}

/** Back a step without validating — nobody should be trapped mid-form. */
export async function goBack(): Promise<void> {
  // The client owns which step is showing; this exists so the browser Back
  // button and the in-form Back control behave the same way.
  return;
}

/**
 * Final submission. Creates the application and hands off to the review state.
 */
export async function submitApplication(): Promise<void> {
  const draft = await readDraft();
  const now = new Date().toISOString();

  for (const step of [
    "phone",
    "verify",
    "about",
    "preferences",
    "interests",
    "photos",
    "prompts",
    "selfie",
  ] as ApplicationStep[]) {
    if (!validateStep(step, draft, now).ok) {
      throw new Error(`Application is incomplete at "${step}".`);
    }
  }

  if (usingSeedData()) {
    // Nothing to write. The review page reads the same cookie and says plainly
    // that no application was filed.
    redirect("/apply/review");
  }

  // Phase 2: create auth user via phone OTP, insert profiles + verifications +
  // applications rows, then advance_application() to 'under_review'. Each is a
  // service-role call behind its RPC — see supabase/migrations/0007_rpcs.sql.
  throw new Error(
    "Supabase is not provisioned. Set NEXT_PUBLIC_USE_SEED_DATA=false only once the " +
      "dedicated project exists and the migrations have been pushed.",
  );
}
