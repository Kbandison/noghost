/**
 * Was the camera ready when we filmed?
 *
 * ---------------------------------------------------------------------------
 * Why this exists, and why it is not about lighting
 * ---------------------------------------------------------------------------
 *
 * The first capture through the Face Liveness screen to score near zero looked
 * exactly like a lighting failure. It was backlit: the wall behind the
 * applicant measured half again as bright as their face, where the same
 * person's best attempt had a face nearly twice as bright as its background.
 *
 * That reading was real and it was not the cause. Rekognition's own
 * `Quality.Brightness` put the failed capture at 83.6 and the best one at 82.5
 * — the face was lit perfectly well. Across four attempts by one person in one
 * afternoon, brightness ordered randomly against the score: the two *brightest*
 * captures produced the two *lowest* passing numbers.
 *
 * Sharpness ordered perfectly.
 *
 *     liveness   frame sharpness                          mean
 *     89.4       96.6  96.6  96.6  96.6  95.5             96.4
 *     73.5       94.1  95.5  97.5  97.5  94.1             95.7
 *     64.6       95.5  95.5  95.5  95.5  92.2             94.8
 *      0.0001    60.5  78.6  89.9  89.9  83.1             80.4
 *
 * The failed capture opens at 60.5 and climbs; every attempt that scored holds
 * flat above 92. Whole-frame exposure tells the same story from the other end —
 * it drifted 28% across that capture against under 5% on all three others — and
 * it was the fastest start of the four, twelve seconds from opening the
 * session. The camera was still focusing and metering while it was being
 * filmed, so the measurement moved while it was being taken. AWS lists that as
 * confounding variation #3, "camera focus and video capture imperfections".
 *
 * ---------------------------------------------------------------------------
 * What this is allowed to do
 * ---------------------------------------------------------------------------
 *
 * Offer a retake. Nothing else. It cannot fail anybody, cannot lower a score,
 * and cannot stop an application — a soft capture is still stored, still
 * scored, and still goes to a reviewer like any other.
 *
 * The trigger is the **capture**, never the score, and that distinction is the
 * whole design. An applicant is never told their liveness number or that they
 * fell short of one; advice offered only after a low score *is* that number,
 * announced. Keyed on sharpness instead, it says the same helpful thing to
 * somebody who scored 96 with a shaky camera as to somebody who scored 12, and
 * so leaks nothing either way.
 *
 * It also declines to coach an attacker. A photograph held up to a lens is
 * sharp and perfectly still — it sails past this check and gets no advice at
 * all. The only people this talks to are the ones whose own camera let them
 * down.
 */

/** One frame, as Rekognition's `DetectFaces` describes it. Both 0–100. */
export interface FrameQuality {
  /** Null when no face was found in the frame — a blur bad enough to lose it. */
  sharpness: number | null;
  brightness: number | null;
}

/**
 * Below this on any frame, treat the capture as unsettled.
 *
 * Every attempt that scored stayed above 92; the one that failed opened at
 * 60.5. Ninety sits in that gap with room on both sides.
 *
 * Four captures by one person is not a distribution, and this number should
 * move once there are more. It is deliberately the *cheap* side of the
 * trade-off to be wrong on: too high only offers a retake somebody can
 * decline, and `capture_sharpness` is recorded on every attempt precisely so
 * this can be re-read against real applicants later.
 */
export const SETTLED_SHARPNESS = 90;

export interface CaptureAssessment {
  /** False means "offer a retake", never "reject". */
  settled: boolean;
  /** The worst frame, which is the one that decides. Null if nothing measured. */
  sharpness: number | null;
  /** Recorded for calibration. Deliberately not part of the decision. */
  brightness: number | null;
  /** Shown to the applicant when unsettled. Never mentions a score. */
  advice: string | null;
}

export function assessCapture(frames: FrameQuality[]): CaptureAssessment {
  const sharp = frames.map((f) => f.sharpness).filter((n): n is number => n !== null);
  const bright = frames.map((f) => f.brightness).filter((n): n is number => n !== null);

  /*
   * Nothing measured — no AWS, an outage, or every frame too blurred to find a
   * face in. Settled, because this must never invent a problem it cannot see:
   * an unmeasurable capture is one a reviewer looks at, not one the applicant
   * is sent back to redo on a hunch.
   */
  if (sharp.length === 0) {
    return {
      settled: true,
      sharpness: null,
      brightness: bright.length > 0 ? Math.min(...bright) : null,
      advice: null,
    };
  }

  // The worst frame, not the average. One badly soft frame early in the video
  // is what a still-focusing camera looks like, and averaging hides it behind
  // the good frames that follow.
  const worst = Math.min(...sharp);
  const settled = worst >= SETTLED_SHARPNESS;

  return {
    settled,
    sharpness: worst,
    brightness: bright.length > 0 ? Math.min(...bright) : null,
    advice: settled
      ? null
      : "That one came out soft — your camera was still focusing. Give it a " +
        "second to settle, hold still, and go again.",
  };
}

/**
 * Which attempt an application rests on.
 *
 * The best one, not the most recent, and the change matters more than it
 * sounds. The applicant who turned this up had **already passed**: 89.4 at
 * 16:05, comfortably over the threshold. They then retook the check — the
 * screen offers "Do it again" and gives no reason not to press it — scored
 * 0.0001 on a camera that had not focused, and filed hours later. Reading the
 * most recent attempt threw the passing one away. Retaking a check you have
 * already passed should not be able to cost you anything.
 *
 * This gives up nothing to an attacker, which is the part worth being precise
 * about. Against somebody retrying until they get through, most-recent and
 * best-of-N are the *same policy*: their passing attempt is also their last
 * one, so both let them in. What bounds that is the rate limit on opening a
 * session — six per ten minutes per applicant — not which attempt is read. Nor
 * does a spoof get luckier with repetition; a printed face scores near zero
 * every time rather than drifting up to 89. So most-recent was buying no
 * security at all, and was charging honest people for a second thought.
 *
 * Ties go to the earlier attempt: if two score the same, the one taken first is
 * the one they did without knowing how it went.
 */
export function bestAttempt<T extends { confidence: number | null; consumedAt: string }>(
  attempts: T[],
): T | null {
  const scored = attempts.filter((a) => a.confidence !== null);

  /*
   * None of them has a score — claimed but never written back, which is what a
   * capture abandoned mid-collection looks like. Fall back to the most recent
   * so the reviewer still gets that attempt's frames to look at; `confidence`
   * stays null, and null already means "nobody checked" everywhere downstream.
   */
  if (scored.length === 0) {
    return [...attempts].sort((a, b) => b.consumedAt.localeCompare(a.consumedAt))[0] ?? null;
  }

  return scored.reduce((best, next) =>
    next.confidence! > best.confidence! ||
    (next.confidence! === best.confidence! && next.consumedAt < best.consumedAt)
      ? next
      : best,
  );
}
