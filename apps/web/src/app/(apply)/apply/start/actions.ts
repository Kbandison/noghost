"use server";

import { usingSeedData } from "@noghost/config/env";
import { createServiceClient } from "@noghost/db/service";
import { allowRequest } from "@/lib/rate-limit";
import {
  OTP_SEND_PER_ADDRESS,
  OTP_SEND_PER_PHONE,
  OTP_SLOW_DOWN,
  OTP_VERIFY_PER_PHONE,
} from "@/lib/auth-limits";
import {
  normalizePhone,
  validateStep,
  type ApplicationDraft,
  type ApplicationStep,
  type FieldErrors,
} from "@noghost/logic";
import type { Gender } from "@noghost/types";
import { readDraft, writeDraft } from "@/lib/application-draft";
import { supabaseServer } from "@/lib/supabase";
import { otpMessage } from "@/lib/otp";

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
 * can't reach across and rewrite an earlier answer. Pure — anything that talks
 * to Supabase happens in `runEffect` below.
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

    case "verify":
      // `phoneVerifiedAt` is set by the effect, which is the only thing that
      // can actually redeem the code. Nothing here is trusted from the form.
      return draft;

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
      // Storage paths returned by the client-side upload, of the form
      // `<user_id>/<uuid>.<ext>`. Bytes never pass through here.
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

    /*
     * An empty field clears a previous recording, which is what makes "record a
     * different one" and skipping after recording the same gesture.
     *
     * `voiceSeenAt` is stamped either way, and stamped here rather than in an
     * effect so it is set before the validator runs: passing through is what
     * satisfies this step, so Continue on an empty recorder has to count as an
     * answer on the very submit that gives it.
     */
    case "voice":
      return {
        ...draft,
        voiceIntroPath: str(fd, "voiceIntroPath") || undefined,
        voiceSeenAt: draft.voiceSeenAt ?? new Date().toISOString(),
      };

    case "selfie":
      return { ...draft, selfiePath: str(fd, "selfiePath") || undefined };
  }
}

/** Side effects a step owns. Only two steps have any. */
async function runEffect(
  step: ApplicationStep,
  draft: ApplicationDraft,
  fd: FormData,
): Promise<{ draft: ApplicationDraft; errors?: FieldErrors }> {
  if (usingSeedData()) {
    // Seed mode keeps the funnel clickable with nothing provisioned. It says
    // so on screen rather than pretending an SMS was sent.
    if (step === "verify") {
      const accepted = /^\d{6}$/.test(str(fd, "code"));
      return { draft: { ...draft, phoneVerifiedAt: accepted ? new Date().toISOString() : undefined } };
    }
    return { draft };
  }

  const supabase = await supabaseServer();

  if (step === "phone") {
    if (!draft.phone) return { draft };

    /*
     * The same two limits sign-in uses, and the same reasoning. This endpoint
     * differs only in `shouldCreateUser: true`, which makes it the *more*
     * attractive one to abuse: every unbounded attempt here is both a text
     * somebody did not ask for and a fresh auth row.
     */
    if (
      !(await allowRequest("otp-send-ip", OTP_SEND_PER_ADDRESS)) ||
      !(await allowRequest("otp-send-phone", OTP_SEND_PER_PHONE, draft.phone))
    ) {
      return { draft, errors: { phone: OTP_SLOW_DOWN } };
    }

    const { error } = await supabase.auth.signInWithOtp({
      phone: draft.phone,
      options: { shouldCreateUser: true },
    });

    if (error) {
      console.error(`[apply] signInWithOtp failed for ${draft.phone}: ${error.message}`);
      return { draft, errors: { phone: otpMessage(error.message) } };
    }
    return { draft };
  }

  if (step === "verify") {
    const code = str(fd, "code");
    if (!draft.phone || !/^\d{6}$/.test(code)) {
      return { draft: { ...draft, phoneVerifiedAt: undefined } };
    }

    if (!(await allowRequest("otp-verify", OTP_VERIFY_PER_PHONE, draft.phone))) {
      return {
        draft: { ...draft, phoneVerifiedAt: undefined },
        errors: { code: OTP_SLOW_DOWN },
      };
    }

    // Redeeming the code is what creates the auth user and the session. Every
    // write after this point — photos, selfie, the profile row — runs as that
    // member under RLS, which is why upload can't happen before this step.
    const { error } = await supabase.auth.verifyOtp({
      phone: draft.phone,
      token: code,
      type: "sms",
    });

    if (error) {
      console.error(`[apply] verifyOtp failed for ${draft.phone}: ${error.message}`);
      return { draft: { ...draft, phoneVerifiedAt: undefined }, errors: { code: otpMessage(error.message) } };
    }
    return { draft: { ...draft, phoneVerifiedAt: new Date().toISOString() } };
  }

  return { draft };
}

export async function submitStep(prev: StepState, formData: FormData): Promise<StepState> {
  const version = (prev.version ?? 0) + 1;
  const step = str(formData, "step") as ApplicationStep;
  const draft = await readDraft();

  const merged = applyStep(step, draft, formData);
  const effect = await runEffect(step, merged, formData);
  const next = effect.draft;

  const now = new Date().toISOString();
  const validation = validateStep(step, next, now);

  // An effect error (a rejected code) outranks the validator's generic message
  // for the same field, because it knows why.
  const errors = effect.errors ?? (validation.ok ? undefined : validation.errors);

  if (errors) {
    // Persist anyway: a failed step should not lose what someone just typed.
    await writeDraft(next);
    return { errors, draft: next, version };
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

  // The last step files the application.
  if (step === "selfie") {
    const filed = await fileApplication(next, now);
    if (filed) return { errors: filed, draft: next, version };
  }

  return { completed: step, draft: next, version };
}

/**
 * Writes the application. Spec §7.2, and the `advance_application` chain in §5.
 *
 * Returns field errors on failure, null on success.
 *
 * Deliberately idempotent rather than transactional: PostgREST has no
 * multi-statement transaction, so a retry after a partial write has to be
 * safe. The profile upserts, and both the verification and the application are
 * insert-if-absent — someone who resubmits gets the same rows, not a second
 * application or a duplicate-key crash.
 */
async function fileApplication(
  draft: ApplicationDraft,
  now: string,
): Promise<FieldErrors | null> {
  if (usingSeedData()) return null;

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { selfie: "Your session expired. Go back to the code step and verify again." };
  }

  // Which season is taking applications. Named columns, one string literal —
  // supabase-js parses this at the type level.
  const { data: season, error: seasonError } = await supabase
    .from("seasons")
    .select("id,name,claim_hours")
    .eq("phase", "applications_open")
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (seasonError) {
    console.error(`[apply] season lookup failed: ${seasonError.message}`);
    return { selfie: "We couldn't reach the season. Try again in a moment." };
  }
  if (!season) {
    return {
      selfie: "Applications aren't open right now. Join the waitlist and we'll tell you when they are.",
    };
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      first_name: draft.firstName!,
      birthdate: draft.birthdate!,
      gender: draft.gender!,
      seeking: draft.seeking!,
      age_min: draft.ageMin!,
      age_max: draft.ageMax!,
      interests: draft.interests ?? [],
      neighborhood: draft.neighborhood ?? null,
      // Order is the array order — the first photo leads the card (spec §7.2).
      // `approved` stays false until a reviewer says otherwise.
      photos: (draft.photoPaths ?? []).map((path, order) => ({ path, order, approved: false })),
      prompts: draft.prompts ?? [],
      // Null rather than absent when skipped, so a resubmission clears a
      // recording somebody changed their mind about.
      voice_intro_path: draft.voiceIntroPath ?? null,
      phone: draft.phone ?? null,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    console.error(`[apply] profile upsert failed for ${user.id}: ${profileError.message}`);
    return { selfie: "We couldn't save your profile. Try again in a moment." };
  }

  // Insert-if-absent. `verifications` has a unique user_id and only an INSERT
  // policy for the owner, so `ignoreDuplicates` is what makes a retry safe —
  // an upsert would need an UPDATE policy that deliberately doesn't exist.
  const { error: verificationError } = await supabase.from("verifications").upsert(
    {
      user_id: user.id,
      phone_verified_at: draft.phoneVerifiedAt ?? now,
      selfie_path: draft.selfiePath!,
    },
    { onConflict: "user_id", ignoreDuplicates: true },
  );

  if (verificationError) {
    console.error(`[apply] verification insert failed for ${user.id}: ${verificationError.message}`);
    return { selfie: "We couldn't save your selfie. Try again in a moment." };
  }

  const { error: applicationError } = await supabase.from("applications").upsert(
    { user_id: user.id, season_id: season.id, status: "applied" },
    { onConflict: "user_id,season_id", ignoreDuplicates: true },
  );

  if (applicationError) {
    console.error(`[apply] application insert failed for ${user.id}: ${applicationError.message}`);
    return { selfie: "We couldn't file your application. Try again in a moment." };
  }

  await advanceToReview(user.id, season.id);
  return null;
}

/**
 * Walks the application to `under_review` — spec §5's status chain, which only
 * moves one step at a time and only through the service-role RPC.
 *
 * The member has already verified their phone and submitted a selfie by the
 * time this runs, so all three hops are true statements about what happened.
 *
 * A failure here is logged, not surfaced: the application row exists and the
 * review queue can be re-driven, so telling the applicant their submission
 * failed would be a lie.
 */
async function advanceToReview(userId: string, seasonId: string): Promise<void> {
  const service = createServiceClient();

  const { data: application } = await service
    .from("applications")
    .select("id,status")
    .eq("user_id", userId)
    .eq("season_id", seasonId)
    .maybeSingle();

  if (!application) return;

  const chain = ["phone_verified", "selfie_submitted", "under_review"] as const;
  const from = chain.indexOf(application.status as (typeof chain)[number]);

  // Resume mid-chain if a previous attempt got part-way.
  for (const status of chain.slice(from + 1)) {
    const { error } = await service.rpc("advance_application", {
      p_application_id: application.id,
      p_new_status: status,
    });
    if (error) {
      console.error(`[apply] advance to ${status} failed for ${application.id}: ${error.message}`);
      return;
    }
  }
}
