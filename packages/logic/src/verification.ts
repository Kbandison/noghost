/**
 * Proving there is a person there — spec §7.2's "selfie liveness".
 *
 * Three things have stood on this screen. A `<input type="file" capture="user">`,
 * which reads as a liveness check and is not one: `capture` is a hint about
 * which app to open, and any image in the roll satisfies it. Then a pose
 * challenge — three stills answering a server-issued sequence, which genuinely
 * defeats a stolen photograph and was honest that it defeated nothing beyond
 * it. Now Amazon Rekognition Face Liveness.
 *
 * The pose challenge's own comments said that catching a screen, a mask or
 * injected video "is what a liveness vendor sells". They did not notice that
 * AWS is one, and that Face Liveness is part of the same service the pose check
 * was already calling. It takes a short video, returns a 0-100 confidence, and
 * is built for exactly the tier the pose sequence conceded.
 *
 * ---------------------------------------------------------------------------
 * Two numbers, and they answer different questions
 * ---------------------------------------------------------------------------
 *
 *   confidence   Was a live human in front of the camera? Rekognition's
 *                judgement about the video, and nothing to do with identity —
 *                a convincing stranger scores well here.
 *   similarity   Is that human the person in these photographs? The face
 *                comparison, which cannot run until there are photographs, two
 *                steps later in the funnel.
 *
 * Both have to be convincing before anything is automatic. Conflating them is
 * how a product ends up admitting a real person who is not the applicant.
 */

/**
 * How sure Rekognition has to be that somebody live was there.
 *
 * AWS returns a probability, not a verdict, and declines to recommend a single
 * number, because it depends on the population being checked. Their guidance
 * frames it as a band: 50-60 catches presentation attacks and some injection;
 * 80-90 catches sophisticated deepfakes and pre-recorded video.
 *
 * Set at 75 — above the moderate band, below deepfake-grade. It started at 85
 * and came down after the first genuine check through this system scored 64.6
 * on an ordinary phone in ordinary light. A threshold nothing real can clear is
 * not strict, it is decorative: auto-admit would never fire and every applicant
 * would queue behind a person who has nothing extra to go on.
 *
 * Nothing under this line is refused. It goes to a reviewer, which is where the
 * application was going anyway, so being wrong in this direction costs thirty
 * seconds of somebody's attention and never an applicant.
 *
 * **This is still undercalibrated.** One real score is not a distribution. The
 * number is on the review screen now (0032) precisely so it can be set from
 * evidence once twenty or so applicants have been through.
 */
export const LIVENESS_CONFIDENCE = 75;

/**
 * How alike two faces have to be before nobody looks.
 *
 * **Set at 82, and that is below what AWS recommends for this use.** Their
 * guidance for face comparison is 90-99, and 99 for anything they class as
 * critical security — identity verification is their own example. 82 is a
 * deliberate choice to send fewer people to a reviewer, made in the knowledge
 * that it widens the gap a determined impersonator could walk through.
 *
 * What makes that survivable rather than reckless is what sits around it. This
 * number cannot reject anybody — under it means a human looks. It cannot admit
 * anybody on its own either: `seasons.auto_admit` is off, and while it is off
 * this threshold changes a label on a review screen and nothing else. Turning
 * auto-admit on is the moment this number starts deciding, and it should be
 * revisited then, against real scores rather than reasoning.
 */
export const MATCH_SIMILARITY = 82;

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
  /** 0–100 from Face Liveness, or null when no check ran at all. */
  livenessConfidence: number | null;
  /** 0–100, or null when no comparison was possible (no AWS, no photo). */
  similarity: number | null;
  /** The season's switch. Off means a person reviews everything. */
  autoAdmitEnabled: boolean;
}): VerificationDecision {
  const { livenessConfidence, similarity, autoAdmitEnabled } = input;

  if (livenessConfidence === null || similarity === null) {
    return {
      outcome: "needs-a-person",
      // Null, not false. "We could not check" and "we checked and it failed"
      // look identical on a review screen if both are written as false, and a
      // reviewer who reads a false as a failed check reviews a different case
      // than the one in front of them.
      livenessPassed: null,
      reason:
        livenessConfidence === null
          ? "No liveness check ran — nothing to go on."
          : "No face comparison was possible — no usable photo to compare against.",
    };
  }

  if (livenessConfidence < LIVENESS_CONFIDENCE) {
    return {
      outcome: "needs-a-person",
      livenessPassed: false,
      reason:
        `Liveness came back at ${livenessConfidence.toFixed(0)}, under ${LIVENESS_CONFIDENCE}. ` +
        "Could be a poor camera or bad light; could be a screen held up to one.",
    };
  }

  if (similarity < MATCH_SIMILARITY) {
    return {
      outcome: "needs-a-person",
      livenessPassed: false,
      reason:
        `Live person confirmed at ${livenessConfidence.toFixed(0)}, but their face matched the ` +
        `photos at only ${similarity.toFixed(0)}, under ${MATCH_SIMILARITY}.`,
    };
  }

  if (!autoAdmitEnabled) {
    return {
      outcome: "needs-a-person",
      livenessPassed: true,
      reason:
        `Live at ${livenessConfidence.toFixed(0)}, matched at ${similarity.toFixed(0)} — but ` +
        "auto-admit is off for this season.",
    };
  }

  return {
    outcome: "auto-admit",
    livenessPassed: true,
    reason:
      `Live at ${livenessConfidence.toFixed(0)}, matched at ${similarity.toFixed(0)}.`,
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

export interface ReviewVerdict {
  label: string;
  tone: VerdictTone;
  detail: string;
  /** The two numbers, formatted for a screen. Null when they do not exist. */
  liveness: string | null;
  match: string | null;
  /**
   * 0037. How the liveness number was arrived at, when it was not the only
   * one — "best of 4, lowest 0".
   *
   * An application now rests on the applicant's BEST completed attempt rather
   * than their most recent, because retaking a check you already passed must
   * not cost you anything. But a reviewer shown the best of five attempts and
   * not told there were five is being flattered rather than informed, and the
   * spread is exactly what distinguishes a camera that needed two goes from
   * somebody fishing for a number.
   *
   * Null when there was only one attempt, because "best of 1" is noise.
   */
  attempts: string | null;
}

export function reviewVerdict(row: {
  livenessPassed: boolean | null;
  /** 0–100 from Face Liveness: was a live human there? */
  livenessConfidence: number | null;
  /** 0–100 from CompareFaces: is that human the person in the photographs? */
  livenessScore: number | null;
  challengePassed: boolean | null;
  autoReason: string | null;
  /** 0037. Completed liveness attempts for this application. */
  livenessAttempts?: number | null;
  /** 0037. The lowest of them, which is what the spread is made of. */
  livenessLowest?: number | null;
}): ReviewVerdict {
  const liveness =
    row.livenessConfidence === null
      ? null
      : `${row.livenessConfidence.toFixed(0)}/100`;
  const match = row.livenessScore === null ? null : `${row.livenessScore.toFixed(0)}/100`;

  const attempts =
    (row.livenessAttempts ?? 0) > 1
      ? `best of ${row.livenessAttempts}` +
        (row.livenessLowest === null || row.livenessLowest === undefined
          ? ""
          : `, lowest ${row.livenessLowest.toFixed(0)}`)
      : null;

  const base = { liveness, match, attempts };

  if (row.livenessPassed === null) {
    return {
      ...base,
      label: "Not checked",
      tone: "quiet",
      detail:
        row.autoReason ??
        (liveness
          ? "The liveness check ran, but the application was never compared against its photos."
          : "No automated check ran. This is not a failed check — compare them yourself."),
    };
  }

  if (row.livenessPassed) {
    return {
      ...base,
      label: match ? `Cleared ${match}` : "Cleared",
      tone: "good",
      detail: row.autoReason ?? "Live person confirmed, and their face matched the photos.",
    };
  }

  /*
   * Which number fell short, said as a number rather than a verdict.
   *
   * The previous wording was "Liveness not convincing", and it was doing harm:
   * the first genuine check through this system scored 64.6, and a reviewer
   * reading "not convincing" above a real applicant's face has been told to
   * distrust them before they look. The thresholds are uncalibrated — AWS
   * declines to recommend one because it depends on the population — so the
   * screen reports the measurement and where the line currently sits, and lets
   * the person decide. That is what they are there for.
   */
  const belowLiveness =
    row.challengePassed === false || (row.livenessConfidence ?? 100) < LIVENESS_CONFIDENCE;

  return {
    ...base,
    label: belowLiveness
      ? `Liveness ${liveness ?? "?"} — your call`
      : `Match ${match ?? "?"} — your call`,
    tone: "warn",
    detail:
      row.autoReason ??
      (belowLiveness
        ? `Under the ${LIVENESS_CONFIDENCE} auto-admit line, which is a threshold we set and not a judgement. ` +
          "Bad light and an older phone both drag this down. Look at the frames."
        : `Under the ${MATCH_SIMILARITY} auto-admit line. A new beard, an old profile photo and a sibling all do this.`),
  };
}
