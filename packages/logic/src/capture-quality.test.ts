import { describe, expect, it } from "vitest";
import { assessCapture, bestAttempt, SETTLED_SHARPNESS } from "./capture-quality";

/**
 * The numbers below are not invented. They are Rekognition's `DetectFaces`
 * readings for four real Face Liveness captures by one applicant in one
 * afternoon, which is the entire evidence base for `SETTLED_SHARPNESS`. If the
 * threshold moves, these are the cases it has to keep getting right.
 */
const REAL = {
  passed894: { sharpness: [96.6, 96.6, 96.6, 96.6, 95.5], brightness: [83.3, 82.8, 80.2, 80.2, 85.8] },
  scored735: { sharpness: [94.1, 95.5, 97.5, 97.5, 94.1], brightness: [90.7, 90.5, 90.2, 89.1, 88.3] },
  scored646: { sharpness: [95.5, 95.5, 95.5, 95.5, 92.2], brightness: [91.0, 90.8, 90.9, 90.3, 92.5] },
  failed000: { sharpness: [60.5, 78.6, 89.9, 89.9, 83.1], brightness: [84.5, 84.9, 82.9, 81.5, 84.1] },
};

const frames = (c: { sharpness: number[]; brightness: number[] }) =>
  c.sharpness.map((s, i) => ({ sharpness: s, brightness: c.brightness[i]! }));

describe("assessCapture", () => {
  it("clears all three captures that produced a score", () => {
    for (const key of ["passed894", "scored735", "scored646"] as const) {
      expect(assessCapture(frames(REAL[key])).settled, key).toBe(true);
    }
  });

  it("catches the capture that scored 0.0001", () => {
    const seen = assessCapture(frames(REAL.failed000));
    expect(seen.settled).toBe(false);
    expect(seen.sharpness).toBe(60.5);
  });

  it("judges on the worst frame, because a still-focusing camera recovers", () => {
    // The failed capture's last three frames are fine. Averaging would pass it.
    const mean =
      REAL.failed000.sharpness.reduce((a, b) => a + b, 0) / REAL.failed000.sharpness.length;
    expect(mean).toBeGreaterThan(SETTLED_SHARPNESS - 11);
    expect(assessCapture(frames(REAL.failed000)).settled).toBe(false);
  });

  it("never decides on brightness, which did not discriminate", () => {
    // The failed capture's face was BRIGHTER than the best one's. If brightness
    // were in the decision at all, this pair would come back the wrong way up.
    const failed = assessCapture(frames(REAL.failed000));
    const passed = assessCapture(frames(REAL.passed894));
    expect(failed.brightness!).toBeGreaterThan(passed.brightness!);
    expect(failed.settled).toBe(false);
    expect(passed.settled).toBe(true);
  });

  it("says nothing when it measured nothing, rather than inventing a problem", () => {
    const seen = assessCapture([{ sharpness: null, brightness: null }]);
    expect(seen.settled).toBe(true);
    expect(seen.advice).toBeNull();
    expect(assessCapture([]).settled).toBe(true);
  });

  it("never mentions a score, in either direction", () => {
    const advice = assessCapture(frames(REAL.failed000)).advice!;
    expect(advice).toBeTruthy();
    expect(advice).not.toMatch(/score|confidence|fail|low|\d+\s*\/\s*100|liveness/i);
    expect(assessCapture(frames(REAL.passed894)).advice).toBeNull();
  });
});

describe("bestAttempt", () => {
  // The real sequence: they passed, then retook it and the retake was the one
  // that counted.
  const theirAfternoon = [
    { confidence: 64.5623, consumedAt: "2026-09-11T14:31:05Z" },
    { confidence: 73.5397, consumedAt: "2026-09-11T15:28:55Z" },
    { confidence: 89.3785, consumedAt: "2026-09-11T16:05:35Z" },
    { confidence: 0.0001, consumedAt: "2026-09-11T17:02:49Z" },
  ];

  it("keeps the 89.4 that the most-recent rule threw away", () => {
    expect(bestAttempt(theirAfternoon)!.confidence).toBe(89.3785);
  });

  it("means retaking a check you passed cannot cost you anything", () => {
    const beforeRetake = bestAttempt(theirAfternoon.slice(0, 3))!.confidence;
    const afterRetake = bestAttempt(theirAfternoon)!.confidence;
    expect(afterRetake).toBe(beforeRetake);
  });

  it("prefers the earlier attempt on a tie", () => {
    const tied = [
      { confidence: 80, consumedAt: "2026-09-11T16:00:00Z" },
      { confidence: 80, consumedAt: "2026-09-11T15:00:00Z" },
    ];
    expect(bestAttempt(tied)!.consumedAt).toBe("2026-09-11T15:00:00Z");
  });

  it("ignores attempts that never got a score", () => {
    const withAbandoned = [
      { confidence: null, consumedAt: "2026-09-11T17:30:00Z" },
      { confidence: 77, consumedAt: "2026-09-11T15:00:00Z" },
    ];
    expect(bestAttempt(withAbandoned)!.confidence).toBe(77);
  });

  it("orders numerically, which string-compare would get backwards", () => {
    /*
     * `confidence` is a Postgres numeric and can arrive as a string. Under
     * lexicographic comparison "9" beats "89", so the worst attempt would win
     * while every type still said `number`. The caller coerces; this pins the
     * case that makes it matter.
     */
    const tricky = [
      { confidence: 89, consumedAt: "2026-09-11T15:00:00Z" },
      { confidence: 9, consumedAt: "2026-09-11T16:00:00Z" },
    ];
    expect(bestAttempt(tricky)!.confidence).toBe(89);

    const asStrings = tricky.map((a) => ({ ...a, confidence: String(a.confidence) }));
    const coerced = asStrings.map((a) => ({ ...a, confidence: Number(a.confidence) }));
    expect(bestAttempt(coerced)!.confidence).toBe(89);
  });

  it("falls back to the latest when nothing was ever scored, so frames survive", () => {
    const none = [
      { confidence: null, consumedAt: "2026-09-11T15:00:00Z" },
      { confidence: null, consumedAt: "2026-09-11T17:30:00Z" },
    ];
    expect(bestAttempt(none)!.consumedAt).toBe("2026-09-11T17:30:00Z");
    expect(bestAttempt([])).toBeNull();
  });
});
