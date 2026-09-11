/**
 * Proving there is a person there — spec §7.2's "selfie liveness".
 *
 * What was shipped before this file was a `<input type="file" capture="user">`.
 * On a phone that opens the camera, which reads as a liveness check and is not
 * one: `capture` is a hint about which app to open, and any image in the roll
 * satisfies it. On a desktop it is an ordinary file picker. So the product's
 * strongest identity claim — "every member is phone-verified and
 * selfie-verified before day one" — rested on somebody choosing to cooperate.
 *
 * ---------------------------------------------------------------------------
 * What this actually proves, and what it does not
 * ---------------------------------------------------------------------------
 *
 * The applicant is given a short sequence of poses, chosen server-side at the
 * moment they ask for it, and has to produce a frame for each. A face that
 * answers a sequence it could not have known in advance is a face that was in
 * front of the camera while the sequence was being read.
 *
 * That defeats the attack this is for: one stolen photograph, or a stranger's
 * whole album. It does NOT defeat somebody who injects video into the camera
 * stream, or who holds a phone playing a responsive deepfake up to the lens.
 * Defeating those is what a liveness vendor sells, and the honest statement of
 * this file's ceiling is: it raises the cost of a casual impersonation from
 * "save an image" to "render a convincing face on demand". Anything stronger
 * would be a claim the code cannot back.
 *
 * ---------------------------------------------------------------------------
 * Why the direction of a turn is never trusted on its own
 * ---------------------------------------------------------------------------
 *
 * Rekognition's `Pose.Yaw` is documented as a float from -180 to 180 and
 * nothing else — AWS does not state whether a positive yaw means the head
 * turned to the subject's left or the viewer's left. Writing `yaw < -18` for
 * "turned left" would be a coin flip encoded as a threshold, and a wrong guess
 * fails every honest applicant while passing nobody extra.
 *
 * So direction is checked as a *relationship*, never as a sign: when the
 * sequence contains both turns, the two frames must have yaw of opposite signs
 * and both beyond the magnitude threshold. That is true under either
 * convention, and it is the part that carries the security weight — one
 * profile photograph cannot produce two opposite turns.
 */

/** One thing an applicant can be asked to do in front of the camera. */
export type ChallengePose = "center" | "left" | "right" | "smile";

/**
 * What a face-detection result has to tell us, in our own shape.
 *
 * Deliberately not Rekognition's type. The thresholds below are the product's
 * policy and should not move because a vendor renamed a field, and a smaller
 * surface is what makes the whole decision testable without an AWS account.
 */
export interface FaceReading {
  /** How many faces were in the frame. More than one is not a selfie. */
  faceCount: number;
  yaw: number;
  pitch: number;
  /** Rekognition reports these as value + confidence; both must be convincing. */
  eyesOpen: boolean;
  smiling: boolean;
  /** Confidence that the detected thing is a face at all, 0–100. */
  confidence: number;
}

/** A turn has to be unmistakable, not a glance. */
export const TURN_YAW_DEGREES = 18;
/** "Facing the camera" for the frame that gets compared against the photos. */
export const CENTER_YAW_DEGREES = 12;
export const CENTER_PITCH_DEGREES = 18;
/** Below this, we are not confident enough that there is a face at all. */
export const FACE_CONFIDENCE = 95;

/**
 * How alike two faces have to be before nobody looks.
 *
 * 92 is deliberately above AWS's own suggested 80 for general matching. The
 * cost of the two mistakes is not symmetric: a false match admits an
 * impersonator into a product whose entire premise is that the person is real,
 * while a false non-match costs a reviewer thirty seconds. When in doubt this
 * system is supposed to ask a person, and this number is where the doubt
 * starts.
 */
export const MATCH_SIMILARITY = 92;

export const CHALLENGE_LENGTH = 3;

/**
 * Build a sequence. Always starts centered, then two more.
 *
 * The centered frame is not a challenge — it is the one that gets compared
 * against the profile photos, and a comparison against a face turned 40 degrees
 * away is a comparison that fails for the wrong reason.
 *
 * At least one turn is always included, because "smile" alone is satisfiable
 * with two photographs of the same cooperative afternoon.
 */
export function buildChallenge(random: () => number): ChallengePose[] {
  const turns: ChallengePose[] = ["left", "right"];
  const first = turns[Math.floor(random() * turns.length)] as ChallengePose;

  // The partner is the other turn, or a smile. Three options rather than two
  // so the order is not guessable from a single previous attempt.
  const others: ChallengePose[] = [first === "left" ? "right" : "left", "smile", "smile"];
  const second = others[Math.floor(random() * others.length)] as ChallengePose;

  // Which of the two comes first is part of what has to be answered live.
  const rest = random() < 0.5 ? [first, second] : [second, first];
  return ["center", ...rest];
}

/** Does one frame answer the pose it was asked for? */
export function poseSatisfied(pose: ChallengePose, face: FaceReading | null): boolean {
  if (!face) return false;
  // Two faces in a verification frame is somebody holding up a photograph of
  // someone else, or a bystander. Either way it is not a selfie.
  if (face.faceCount !== 1) return false;
  if (face.confidence < FACE_CONFIDENCE) return false;

  switch (pose) {
    case "center":
      return (
        Math.abs(face.yaw) < CENTER_YAW_DEGREES &&
        Math.abs(face.pitch) < CENTER_PITCH_DEGREES &&
        face.eyesOpen
      );
    // Magnitude only. See the note at the top: the sign convention is not
    // documented, and the direction is verified by `turnsOppose` instead.
    case "left":
    case "right":
      return Math.abs(face.yaw) >= TURN_YAW_DEGREES;
    case "smile":
      return face.smiling;
  }
}

/**
 * When both turns were asked for, they must go opposite ways.
 *
 * This is the check a single photograph cannot pass, and it holds whichever
 * way round AWS's yaw happens to run. Absent both turns there is nothing to
 * compare, and the answer is vacuously true rather than false — refusing a
 * sequence we never asked for would fail honest applicants.
 */
export function turnsOppose(poses: ChallengePose[], faces: (FaceReading | null)[]): boolean {
  const left = faces[poses.indexOf("left")];
  const right = faces[poses.indexOf("right")];
  if (!poses.includes("left") || !poses.includes("right")) return true;
  if (!left || !right) return false;
  return Math.sign(left.yaw) !== Math.sign(right.yaw) && left.yaw !== 0 && right.yaw !== 0;
}

/** Every frame answers its pose, and the turns disagree with each other. */
export function challengePassed(
  poses: ChallengePose[],
  faces: (FaceReading | null)[],
): boolean {
  if (poses.length !== faces.length || poses.length === 0) return false;
  if (!poses.every((pose, i) => poseSatisfied(pose, faces[i] ?? null))) return false;
  return turnsOppose(poses, faces);
}

export type VerificationOutcome = "auto-admit" | "needs-a-person";

export interface VerificationDecision {
  outcome: VerificationOutcome;
  /** Stored on the row. Null means nothing automated ran — not "failed". */
  livenessPassed: boolean | null;
  /** Why, in words a reviewer reads. Never shown to the applicant. */
  reason: string;
}

/**
 * The decision, and the one rule that matters: **this never rejects.**
 *
 * Every path that is not a confident pass ends at `needs-a-person`. A face
 * comparison that comes back at 60 is not evidence of fraud — it is a bad
 * light, a new beard, a sibling, an eight-year-old profile photo, or a face the
 * model is measurably worse at. Letting an automated score reject somebody
 * would build exactly the failure this product cannot afford: quietly turning
 * away real people, disproportionately, with no record of why and nobody to
 * appeal to.
 *
 * So the automation only ever *skips* work. It admits the clear cases and hands
 * everything else to a human, which is what it would have been anyway.
 */
export function decideVerification(input: {
  /** False when the checks ran and failed; null when they could not run. */
  challengeOk: boolean | null;
  /** 0–100, or null when no comparison was possible (no AWS, no photo). */
  similarity: number | null;
  /** The season's switch. Off means a person reviews everything. */
  autoAdmitEnabled: boolean;
}): VerificationDecision {
  const { challengeOk, similarity, autoAdmitEnabled } = input;

  if (challengeOk === null || similarity === null) {
    return {
      outcome: "needs-a-person",
      // Null, not false. "We could not check" and "we checked and it failed"
      // look identical on a review screen if both are written as false, and a
      // reviewer who reads a false as a failed check reviews a different case
      // than the one in front of them.
      livenessPassed: null,
      reason:
        challengeOk === null
          ? "No automated check ran — nothing to go on."
          : "No face comparison was possible — no usable photo to compare against.",
    };
  }

  if (!challengeOk) {
    return {
      outcome: "needs-a-person",
      livenessPassed: false,
      reason: "The pose sequence was not answered. Could be a bad camera; could be a photograph.",
    };
  }

  if (similarity < MATCH_SIMILARITY) {
    return {
      outcome: "needs-a-person",
      livenessPassed: false,
      reason: `Live face and photos matched at ${similarity.toFixed(0)}, under ${MATCH_SIMILARITY}.`,
    };
  }

  if (!autoAdmitEnabled) {
    return {
      outcome: "needs-a-person",
      livenessPassed: true,
      reason: `Matched at ${similarity.toFixed(0)}, but auto-admit is off for this season.`,
    };
  }

  return {
    outcome: "auto-admit",
    livenessPassed: true,
    reason: `Live sequence answered and matched at ${similarity.toFixed(0)}.`,
  };
}

/**
 * What the automated check found, in words a reviewer acts on.
 *
 * In `packages/logic` rather than in the console page, for §4.1's reason — "no
 * mechanic logic in components, ever" — and for a sharper one: the first branch
 * here is the entire reason `liveness_passed` is three-valued, and a rule that
 * load-bearing should not live somewhere it cannot be tested.
 *
 * Null means **nothing ran**, not that the check failed. No AWS credentials, a
 * Rekognition outage, a photo that could not be read — all land there. A
 * reviewer who reads that as "failed liveness" is reviewing a different case
 * than the one in front of them, so the screen says so rather than leaving a
 * blank for them to fill in with an assumption.
 *
 * No branch says "rejected", because nothing here can reject anybody, and a
 * reviewer who believes the machine already decided stops looking properly.
 */
export type VerdictTone = "good" | "warn" | "quiet";

export function reviewVerdict(row: {
  livenessPassed: boolean | null;
  livenessScore: number | null;
  challengePassed: boolean | null;
  autoReason: string | null;
}): { label: string; tone: VerdictTone; detail: string } {
  const score = row.livenessScore === null ? null : `${row.livenessScore.toFixed(0)}/100`;

  if (row.livenessPassed === null) {
    return {
      label: "Not checked",
      tone: "quiet",
      detail:
        row.autoReason ??
        "No automated check ran. This is not a failed check — compare them yourself.",
    };
  }

  if (row.livenessPassed) {
    return {
      label: score ? `Matched ${score}` : "Matched",
      tone: "good",
      detail: row.autoReason ?? "Answered the live sequence and matched the photos.",
    };
  }

  return {
    label:
      row.challengePassed === false
        ? "Sequence not answered"
        : `Weak match${score ? ` ${score}` : ""}`,
    tone: "warn",
    detail: row.autoReason ?? "The automated check was not confident. Your call.",
  };
}
