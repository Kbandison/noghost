/**
 * Is this a photograph of the person applying?
 *
 * 0020 built photo approval and gave it to a person: every uploaded photo
 * arrives `approved: false`, `visible_profiles` shows only approved ones, and a
 * reviewer sets the flag. That worked while every application was read by hand.
 *
 * Auto-admit broke it, quietly. An application the identity check clears never
 * reaches a reviewer, so nobody ever approves the photos — and
 * `visible_profiles` filters unapproved ones out. The member is admitted, pays
 * for a seat, and appears in the drop **with no face at all**. Not a degraded
 * card: an empty one.
 *
 * So this is not an extra safety feature bolted on. Until photos can be cleared
 * without a person, auto-admit cannot produce a member anybody can see.
 *
 * ---------------------------------------------------------------------------
 * Refusing a photo is not rejecting a person
 * ---------------------------------------------------------------------------
 *
 * Everywhere else in verification the rule is that nothing automated may turn
 * somebody away — a low score sends an application to a reviewer, never out the
 * door. That rule is about *people*.
 *
 * A photo is different, and the difference is that it is trivially reversible.
 * "That one won't work, pick another" is a sentence somebody acts on in ten
 * seconds; it costs them a photograph, not their application.
 *
 * Two things are refused outright, at the upload rather than at submission:
 * explicit content, and images Rekognition is confident are drawings. Both come
 * with a sentence saying what to do instead, because a refusal with no next
 * action is a dead end and the applicant has the picker open right now.
 * Everything else ambiguous goes to a person.
 *
 * ---------------------------------------------------------------------------
 * What is deliberately NOT refused
 * ---------------------------------------------------------------------------
 *
 * Rekognition's taxonomy flags swimwear, alcohol, tobacco and rude gestures.
 * On a dating profile a beach photo and a glass of wine are ordinary, and a
 * product that silently deleted them would be prudish in a way its members
 * would notice and resent. Those flag for a human and nothing more.
 *
 * Matching is on the top-level category rather than the leaf label, and by
 * substring rather than an enumerated list. AWS versions this taxonomy — it is
 * on version 7 — and a hardcoded set of leaf names is a list that silently
 * stops matching when they publish version 8. Anything unrecognised falls to a
 * person, which is the safe direction for a list to be wrong in.
 */

export interface ModerationFlag {
  /** The leaf label, e.g. "Exposed Male Genitalia". */
  name: string;
  /** The top-level category, e.g. "Explicit". Absent on top-level labels. */
  parent: string | null;
  confidence: number;
}

export interface PhotoReading {
  /** Moderation labels Rekognition returned above its confidence floor. */
  flags: ModerationFlag[];
  /**
   * What KIND of image this is — "Animated", "Illustrated" and so on.
   * Rekognition predicts this alongside moderation, and it is the answer to
   * "somebody uploaded a cartoon character".
   */
  contentTypes: { name: string; confidence: number }[];
  /** Real faces found. Zero means a drawing, a landscape, a pet, a bad crop. */
  faceCount: number;
  /** The largest face's width as a share of the frame, 0–1. */
  faceShare: number;
  /** Rekognition's confidence that the largest face is a face, 0–100. */
  faceConfidence: number;
}

export type PhotoVerdict = "ok" | "refuse" | "needs-a-person";

export interface PhotoDecision {
  verdict: PhotoVerdict;
  /** Said to the applicant when refused; said to a reviewer otherwise. */
  reason: string;
}

/** Below this, a moderation label is not worth acting on either way. */
export const MODERATION_FLOOR = 60;
/** Refusing a photo outright needs more certainty than flagging one. */
export const REFUSE_CONFIDENCE = 85;
/** How sure we need to be that the thing in frame is a face at all. */
export const FACE_CONFIDENCE = 90;
/**
 * A face smaller than this is a holiday snap with somebody in it, not a photo
 * of them. It is also too small for `CompareFaces` to say anything useful.
 */
export const MIN_FACE_SHARE = 0.08;

/** Categories refused without asking anybody. Substring, case-insensitive. */
const REFUSE_CATEGORIES = ["explicit"];

/** Image kinds that are not photographs of a person. */
const NOT_A_PHOTOGRAPH = ["animated", "illustrated", "cartoon", "drawing", "rendered"];

/**
 * A drawing is refused, not queued — but only when Rekognition is very sure.
 *
 * "Pick a real photo of yourself" is a sentence somebody acts on immediately,
 * so refusing outright is kinder than a silent wait. The bar is higher than the
 * explicit one because the failure modes differ: a heavy filter, a black-and-
 * white portrait or a studio backdrop can read as illustrated, and refusing a
 * real photograph of a real person is the mistake worth avoiding here.
 */
export const REFUSE_NOT_PHOTO_CONFIDENCE = 90;

const topLevel = (flag: ModerationFlag): string => flag.parent ?? flag.name;

export function decidePhoto(reading: PhotoReading | null): PhotoDecision {
  /*
   * No reading at all — no AWS, an outage, an unreadable file. A person looks,
   * which is exactly what happened before any of this existed.
   */
  if (!reading) {
    return { verdict: "needs-a-person", reason: "No automated check ran on this photo." };
  }

  const refusable = reading.flags.filter(
    (flag) =>
      flag.confidence >= REFUSE_CONFIDENCE &&
      REFUSE_CATEGORIES.some((category) => topLevel(flag).toLowerCase().includes(category)),
  );
  if (refusable.length > 0) {
    return {
      // Named by category, never by leaf label. "Explicit content" is what
      // somebody needs to know; the leaf label is a description of their body
      // they did not ask a computer to write.
      verdict: "refuse",
      reason: "That photo has explicit content in it. Pick a different one.",
    };
  }

  const flagged = reading.flags.filter((flag) => flag.confidence >= MODERATION_FLOOR);
  if (flagged.length > 0) {
    const names = [...new Set(flagged.map(topLevel))].join(", ");
    return { verdict: "needs-a-person", reason: `Flagged: ${names}.` };
  }

  const notPhoto = reading.contentTypes.filter((type) =>
    NOT_A_PHOTOGRAPH.some((kind) => type.name.toLowerCase().includes(kind)),
  );
  const certainlyNotPhoto = notPhoto.find((t) => t.confidence >= REFUSE_NOT_PHOTO_CONFIDENCE);
  if (certainlyNotPhoto) {
    return {
      verdict: "refuse",
      reason:
        "That looks like a drawing or a cartoon rather than a photograph. " +
        "We need real photos of you.",
    };
  }
  if (notPhoto.some((t) => t.confidence >= MODERATION_FLOOR)) {
    return {
      verdict: "needs-a-person",
      reason: `Looks like ${notPhoto[0]!.name.toLowerCase()} rather than a photograph.`,
    };
  }

  if (reading.faceCount === 0) {
    return {
      verdict: "needs-a-person",
      reason: "No face in it — could be a drawing, a landscape, or a bad crop.",
    };
  }

  if (reading.faceCount > 1) {
    // §7.2 asks for photos of the applicant. A group shot is not refused —
    // plenty of people's best photo has a friend in it — but somebody should
    // decide which face is theirs before it leads their card.
    return { verdict: "needs-a-person", reason: `${reading.faceCount} faces in it.` };
  }

  if (reading.faceConfidence < FACE_CONFIDENCE) {
    return { verdict: "needs-a-person", reason: "Whatever is in frame may not be a face." };
  }

  if (reading.faceShare < MIN_FACE_SHARE) {
    return {
      verdict: "needs-a-person",
      reason: "The face is too small in frame to compare against anything.",
    };
  }

  return { verdict: "ok", reason: "One clear face, nothing flagged." };
}

/**
 * The whole set, because approval is all-or-nothing for automation.
 *
 * A single photo needing a person means the application is going to a person
 * anyway, and once they are looking they should decide about all of them
 * together rather than inheriting a machine's partial verdict on the rest.
 */
export function decidePhotoSet(readings: (PhotoReading | null)[]): {
  verdict: PhotoVerdict;
  perPhoto: PhotoDecision[];
} {
  const perPhoto = readings.map(decidePhoto);

  if (perPhoto.length === 0) {
    return { verdict: "needs-a-person", perPhoto };
  }
  if (perPhoto.some((d) => d.verdict === "refuse")) {
    return { verdict: "refuse", perPhoto };
  }
  if (perPhoto.some((d) => d.verdict === "needs-a-person")) {
    return { verdict: "needs-a-person", perPhoto };
  }
  return { verdict: "ok", perPhoto };
}
