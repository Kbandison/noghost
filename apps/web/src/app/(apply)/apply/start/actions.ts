"use server";

import { OTP_PATTERN } from "@noghost/config";
import { usingSeedData } from "@noghost/config/env";
import { createServiceClient } from "@noghost/db/service";
import { allowRequest } from "@/lib/rate-limit";
import { compareFaces, faceChecksConfigured } from "@/lib/rekognition";
import {
  OTP_SEND_PER_ADDRESS,
  OTP_SEND_PER_PHONE,
  OTP_SLOW_DOWN,
  OTP_VERIFY_PER_PHONE,
} from "@/lib/auth-limits";
import {
  FINAL_STEP,
  FORM_ERROR,
  LIVENESS_CONFIDENCE,
  bestAttempt,
  decideVerification,
  normalizePhone,
  roundForStorage,
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
        // Lowercased and trimmed here so the draft, the profile and the
        // `citext` unique index all agree on what one address is.
        email: str(fd, "email").trim().toLowerCase() || undefined,
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
        neighborhood: str(fd, "neighborhood").trim() || undefined,
        /*
         * Both halves or neither — a half-point is what 0028's
         * `profiles_point_whole` constraint refuses, and it is better to treat
         * it as "not set" here than to let the write fail at the last step.
         */
        point:
          num(fd, "lat") !== undefined && num(fd, "lng") !== undefined
            ? roundForStorage({ lat: num(fd, "lat")!, lng: num(fd, "lng")! })
            : undefined,
        placeLabel: str(fd, "placeLabel") || undefined,
        travelRadiusKm: num(fd, "travelRadiusKm"),
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

    case "agree":
      return {
        ...draft,
        agreedAt: str(fd, "agree") === "on" ? new Date().toISOString() : undefined,
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
      const accepted = OTP_PATTERN.test(str(fd, "code"));
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
    if (!draft.phone || !OTP_PATTERN.test(code)) {
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
        ? "Seed mode — no SMS was sent. Any 6-10 digits will do."
        : `Code sent to ${next.phone}.`,
    };
  }

  // The last step files the application — whichever one that is. Keyed on
  // `FINAL_STEP` rather than a literal, because the step it used to name moved
  // to position three and a literal would have filed an empty application.
  if (step === FINAL_STEP) {
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
    return { [FORM_ERROR]: "Your session expired. Go back to the code step and verify again." };
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
    return { [FORM_ERROR]: "We couldn't reach the season. Try again in a moment." };
  }
  if (!season) {
    return {
      [FORM_ERROR]: "Applications aren't open right now. Join the waitlist and we'll tell you when they are.",
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
      /*
       * The place the lookup resolved — "Grayson, GA" — rather than something
       * typed. `neighborhood` is what sits under a name on the card, and it
       * used to be free text because the alternative was a dropdown of nine
       * Atlanta districts. A reverse-geocoded label is more accurate than
       * anything an applicant would type and cannot disagree with the
       * coordinate beside it, so the field stopped being asked for.
       */
      neighborhood: draft.placeLabel ?? draft.neighborhood ?? null,
      // Rounded twice on purpose. `LocationField` rounds on the device, which
      // is what makes the promise ("the precise value never leaves your
      // browser") true for the honest path; `applyStep` rounds again because a
      // posted form is not the honest path and this is a plain HTTP field.
      // The column would round it a third time, silently — which is exactly
      // why neither of the first two can be left to it.
      lat: draft.point?.lat ?? null,
      lng: draft.point?.lng ?? null,
      travel_radius_km: draft.travelRadiusKm ?? null,
      // Order is the array order — the first photo leads the card (spec §7.2).
      // `approved` stays false until a reviewer says otherwise.
      photos: (draft.photoPaths ?? []).map((path, order) => ({ path, order, approved: false })),
      prompts: draft.prompts ?? [],
      // Null rather than absent when skipped, so a resubmission clears a
      // recording somebody changed their mind about.
      voice_intro_path: draft.voiceIntroPath ?? null,
      phone: draft.phone ?? null,
      // §7.4. Without this the four email templates in §8 have no recipient —
      // see 0026, which is where the column finally came from.
      email: draft.email ?? null,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    console.error(`[apply] profile upsert failed for ${user.id}: ${profileError.message}`);
    return { [FORM_ERROR]: "We couldn't save your profile. Try again in a moment." };
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
    return { [FORM_ERROR]: "We couldn't save your selfie. Try again in a moment." };
  }

  const { data: filed, error: applicationError } = await supabase
    .from("applications")
    .upsert(
      { user_id: user.id, season_id: season.id, status: "applied" },
      { onConflict: "user_id,season_id", ignoreDuplicates: true },
    )
    .select("id");

  if (applicationError) {
    console.error(`[apply] application insert failed for ${user.id}: ${applicationError.message}`);
    return { [FORM_ERROR]: "We couldn't file your application. Try again in a moment." };
  }

  /*
   * §8's `application_received`, which nothing has ever enqueued.
   *
   * Gated on the row actually being inserted. `ignoreDuplicates` returns an
   * empty set for a resubmission, which is exactly the once-only signal needed
   * — an unguarded enqueue here would mail somebody a receipt every time they
   * re-ran the last step.
   *
   * Through the service client because `enqueue_notification` is not granted to
   * `authenticated`, and failure is logged rather than surfaced for the same
   * reason `advanceToReview`'s is: the application exists, and telling the
   * applicant their submission failed over a missing receipt would be a lie.
   */
  if ((filed ?? []).length > 0) {
    const { error: notifyError } = await createServiceClient().rpc("enqueue_notification", {
      p_user: user.id,
      p_channel: "email",
      p_template: "application_received",
      p_payload: { season_id: season.id, season_name: season.name },
    });
    if (notifyError) {
      console.error(`[apply] application_received for ${user.id}: ${notifyError.message}`);
    }
  }

  await advanceToReview(user.id, season.id);
  await runIdentityMatch(user.id, season.id, draft.photoPaths ?? []);
  return null;
}

/**
 * The second half of verification — comparing the live face to the photos.
 *
 * It could not run at step three, because at step three there are no photos.
 * That sequencing falls out of moving the selfie forward rather than being
 * worked around: the pose sequence proves somebody was there, here, now; this
 * proves the somebody is the person on the profile. Both are needed and they
 * become possible at different moments.
 *
 * Everything about this is best-effort and nothing about it can turn anybody
 * away. No AWS, no photo, a Rekognition outage, a timeout — every one of those
 * ends at the same place the application was already going, which is a person's
 * screen. Failures are logged, never surfaced: the application is filed and
 * telling the applicant otherwise would be a lie.
 */
async function runIdentityMatch(
  userId: string,
  seasonId: string,
  photoPaths: string[],
): Promise<void> {
  if (usingSeedData()) return;

  const service = createServiceClient();

  /*
   * The liveness confidence has been sitting on the challenge row since step
   * three, because `verifications.user_id` references `profiles.id` and no
   * profile existed then. It does now — `fileApplication` upserted it a few
   * lines ago — so this is the first moment the two numbers can be put
   * together: was somebody live, and are they the person in these photographs.
   *
   * ---------------------------------------------------------------------
   * Their best attempt, not their last one
   * ---------------------------------------------------------------------
   *
   * This used to read the most recent, and that threw away a pass. The
   * applicant who turned it up scored 89.4 at 16:05, pressed "Do it again" —
   * which the screen offers and gives no reason to decline — scored 0.0001 on
   * a camera that had not focused, and filed hours later on the 0.0001.
   * Retaking a check you have already passed must not be able to cost you
   * anything.
   *
   * It concedes nothing to an attacker: against somebody retrying until they
   * get through, most-recent and best-of-N admit exactly the same people,
   * because their passing attempt is also their last. What bounds that is the
   * six-per-ten-minutes limit on opening a session, not which row is read.
   *
   * Scoped to attempts made for THIS application. Challenges are keyed only to
   * a person, so they outlive the application they were taken for; without a
   * floor, somebody reapplying next season would inherit last season's good
   * score and never have to prove liveness again. The previous application's
   * timestamp is that floor, and it is entirely server-side — the draft cookie
   * knows when this funnel began but the applicant owns the cookie.
   */
  const { data: earlier } = await service
    .from("applications")
    .select("created_at")
    .eq("user_id", userId)
    .neq("season_id", seasonId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let attemptQuery = service
    .from("verification_challenges")
    .select("id,confidence,frame_paths,consumed_at")
    .eq("user_id", userId)
    .not("consumed_at", "is", null);

  if (earlier?.created_at) attemptQuery = attemptQuery.gt("consumed_at", earlier.created_at);

  const { data: attempts } = await attemptQuery;

  /*
   * `Number()` before comparing, and it is load-bearing.
   *
   * `confidence` is a Postgres `numeric`, which can arrive over the wire as a
   * string. `bestAttempt` picks with `>`, and on strings that is lexicographic:
   * "9" would beat "89", so the worst attempt could win while the types say
   * `number` and nothing anywhere throws. The surrounding code already coerces
   * this column defensively; the comparison needs it more than the arithmetic
   * does.
   */
  const challenge = bestAttempt(
    (attempts ?? []).map((row) => ({
      ...row,
      confidence: row.confidence === null ? null : Number(row.confidence),
      consumedAt: row.consumed_at!,
    })),
  );

  /*
   * The winning attempt's own reference image, not whatever the last capture
   * left on the row.
   *
   * These have to come from the same video. Scoring liveness from attempt A
   * while comparing the face in attempt B's photograph would attest that a live
   * person was present and that a face matches, without those two statements
   * ever being about the same recording — which is precisely the gap an
   * attacker with one good capture and one good likeness would drive through.
   */
  const live = challenge?.frame_paths?.[0];
  // The lead photo — the one that leads their card, and the one a reviewer
  // would have compared by eye.
  const photo = photoPaths[0];

  /*
   * `faceChecksConfigured()` gates the comparison, not the copy. Without AWS
   * there is no similarity — but the frames and the pose result still have to
   * land on the verification row, because a reviewer with no photographs to
   * look at has nothing to review. Skipping the whole function when AWS is
   * absent would have made the reorder silently lose the capture.
   */
  let similarity: number | null = null;
  if (faceChecksConfigured() && live && photo) {
    const [liveFile, photoFile] = await Promise.all([
      service.storage.from("verification-selfies").download(live),
      service.storage.from("photos").download(photo),
    ]);

    if (liveFile.data && photoFile.data) {
      similarity = await compareFaces(
        new Uint8Array(await liveFile.data.arrayBuffer()),
        new Uint8Array(await photoFile.data.arrayBuffer()),
      );
    } else {
      console.error(`[apply] identity match: could not read both images for ${userId}`);
    }
  }

  const { data: season } = await service
    .from("seasons")
    .select("auto_admit")
    .eq("id", seasonId)
    .maybeSingle();

  const confidence =
    challenge?.confidence === null || challenge?.confidence === undefined
      ? null
      : Number(challenge.confidence);

  const decision = decideVerification({
    livenessConfidence: confidence,
    similarity,
    autoAdmitEnabled: season?.auto_admit ?? false,
  });

  const { error: writeError } = await service
    .from("verifications")
    .update({
      challenge_id: challenge?.id ?? null,
      // Derived at filing rather than stored at capture, so that moving the
      // threshold re-reads history correctly instead of leaving rows judged by
      // a number nobody can look up any more.
      challenge_passed: confidence === null ? null : confidence >= LIVENESS_CONFIDENCE,
      frame_paths: challenge?.frame_paths ?? null,
      /*
       * Re-pointed at the winning attempt's reference image.
       *
       * `fileApplication` wrote whatever the last capture left on the draft,
       * which since best-of-N need not be the attempt this application rests
       * on. The reviewer's screen, the member's own deletion request and the
       * face comparison above all read this column, and all three must be
       * looking at the recording that was actually judged. Left alone when
       * there is no attempt at all, so this can never blank an existing path.
       */
      ...(live ? { selfie_path: live } : {}),
      liveness_score: similarity,
      liveness_passed: decision.livenessPassed,
      auto_reason: decision.reason,
      auto_checked_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (writeError) {
    console.error(`[apply] identity match write for ${userId}: ${writeError.message}`);
  }

  /*
   * The photos, before anything is admitted.
   *
   * 0020 gives every uploaded photo `approved: false` and `visible_profiles`
   * filters unapproved ones out, which was fine while a reviewer read every
   * application. Auto-admit broke that silently: an application nobody reads is
   * an application whose photos nobody approves, and the member arrives in the
   * drop with an empty card. Admitted, paid up, and invisible.
   *
   * So clearing the photos is a precondition of admitting automatically, not a
   * separate feature. If any photo needs a person, the whole application does —
   * which is the state it was in before this ran.
   */
  const photoVerdict = await clearPhotos(service, userId, photoPaths);

  if (photoVerdict !== "ok") {
    await service
      .from("verifications")
      .update({
        auto_reason:
          `${decision.reason} Photos need a look: ${photoVerdict === "refuse" ? "one was refused" : "one was flagged"}.`,
      })
      .eq("user_id", userId);
    return;
  }

  if (decision.outcome !== "auto-admit") return;

  const { data: application } = await service
    .from("applications")
    .select("id,status")
    .eq("user_id", userId)
    .eq("season_id", seasonId)
    .maybeSingle();

  // Only from `under_review`. An application a person already decided on is
  // not one an automated check gets to revisit, and `advance_application`
  // would refuse the transition anyway — this is so it is never attempted.
  if (application?.status !== "under_review") return;

  const { error: admitError } = await service.rpc("advance_application", {
    p_application_id: application.id,
    p_new_status: "admitted",
  });

  if (admitError) {
    // Logged and dropped. The application stays in the review queue, which is
    // the safe direction for this to fail in.
    console.error(`[apply] auto-admit ${application.id}: ${admitError.message}`);
    return;
  }

  /*
   * A second audit row, on purpose.
   *
   * `advance_application` writes its own `{from, to}` under the all-zeros
   * admin id, which is the same signature the claim-sweep cron leaves. Six
   * months from now "who admitted this person" has to have a better answer
   * than "something automated did", so this records what the machine actually
   * saw. Failure here is logged rather than rolled back — an admitted member
   * with a thin trail beats an admission reversed by a logging problem.
   */
  const { error: auditError } = await service.rpc("audit", {
    p_action: "auto_admit",
    p_table: "applications",
    p_target: application.id,
    p_detail: { similarity, reason: decision.reason },
  });
  if (auditError) {
    console.error(`[apply] auto-admit audit ${application.id}: ${auditError.message}`);
  }
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

/**
 * Judge each photo, and approve them only if every one is clean.
 *
 * Runs as the service role, which is the only caller that can set `approved` —
 * 0021's trigger rewrites the flag for any signed-in member, precisely so a
 * client cannot approve itself, and 0025 narrowed that to signed-in members so
 * a server-side caller like this one can.
 *
 * Returns the set verdict. `refuse` means at least one photo had explicit
 * content; `needs-a-person` covers everything else uncertain, including AWS
 * being unavailable.
 */
async function clearPhotos(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
  photoPaths: string[],
): Promise<"ok" | "refuse" | "needs-a-person"> {
  if (photoPaths.length === 0) return "needs-a-person";

  /*
   * Read, not recomputed.
   *
   * Every photo was screened at upload (0034), so asking Rekognition again here
   * would double the bill and could disagree with the answer the applicant was
   * already given — which is the worse of the two problems. Safe to trust
   * because the `photos` bucket has no update policy and each upload takes a
   * fresh uuid: the bytes at a screened path cannot have changed since.
   */
  const { data: screenings } = await service
    .from("photo_screenings")
    .select("path,verdict")
    .eq("user_id", userId)
    .in("path", photoPaths);

  const byPath = new Map((screenings ?? []).map((s) => [s.path, s.verdict as string]));

  // A path with no screening was never checked — AWS off at the time, or an
  // upload that predates this. Unchecked is not clean.
  const verdicts = photoPaths.map((path) => byPath.get(path) ?? "needs-a-person");

  if (verdicts.some((v) => v === "refuse")) return "refuse";
  if (verdicts.some((v) => v !== "ok")) {
    console.error(
      `[apply] photos for ${userId} need a look: ` +
        photoPaths.map((p, i) => `${p.split("/").pop()}=${verdicts[i]}`).join(", "),
    );
    return "needs-a-person";
  }

  const { data: profile } = await service
    .from("profiles")
    .select("photos")
    .eq("id", userId)
    .maybeSingle();

  const photos = (profile?.photos ?? []) as { path: string; order: number; approved: boolean }[];
  const { error } = await service
    .from("profiles")
    .update({ photos: photos.map((photo) => ({ ...photo, approved: true })) })
    .eq("id", userId);

  if (error) {
    console.error(`[apply] approving photos for ${userId}: ${error.message}`);
    return "needs-a-person";
  }
  return "ok";
}
