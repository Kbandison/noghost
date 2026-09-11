import { describe, expect, it } from "vitest";
import {
  LIVENESS_CONFIDENCE,
  MATCH_SIMILARITY,
  decideVerification,
  reviewVerdict,
} from "./verification";

describe("decideVerification — never rejects", () => {
  const on = { autoAdmitEnabled: true };

  it("auto-admits a live person who matches their photos", () => {
    const d = decideVerification({ livenessConfidence: 97, similarity: 97, ...on });
    expect(d.outcome).toBe("auto-admit");
    expect(d.livenessPassed).toBe(true);
  });

  it("sends a weak liveness score to a person, and does not reject it", () => {
    const d = decideVerification({ livenessConfidence: 40, similarity: 99, ...on });
    expect(d.outcome).toBe("needs-a-person");
    expect(d.livenessPassed).toBe(false);
    expect(d.reason).toContain("40");
  });

  it("sends a weak face match to a person, and does not reject it", () => {
    const d = decideVerification({ livenessConfidence: 99, similarity: 60, ...on });
    expect(d.outcome).toBe("needs-a-person");
    expect(d.reason).toContain("60");
  });

  it("keeps the two numbers apart in the reason a reviewer reads", () => {
    // A convincing stranger scores high on liveness and low on match. If the
    // screen conflates them the reviewer cannot tell that case from a bad
    // camera, and those want opposite decisions.
    const stranger = decideVerification({ livenessConfidence: 98, similarity: 30, ...on });
    expect(stranger.reason).toContain("98");
    expect(stranger.reason).toContain("30");
  });

  it("never returns any outcome other than admit or review", () => {
    const outcomes = new Set<string>();
    for (const livenessConfidence of [null, 0, 50, 84.9, 85, 100]) {
      for (const similarity of [null, 0, 50, 91.9, 92, 100]) {
        for (const autoAdmitEnabled of [true, false]) {
          outcomes.add(
            decideVerification({ livenessConfidence, similarity, autoAdmitEnabled }).outcome,
          );
        }
      }
    }
    expect([...outcomes].sort()).toEqual(["auto-admit", "needs-a-person"]);
  });

  it("holds both thresholds exactly", () => {
    const at = decideVerification({
      livenessConfidence: LIVENESS_CONFIDENCE,
      similarity: MATCH_SIMILARITY,
      ...on,
    });
    expect(at.outcome).toBe("auto-admit");
    expect(
      decideVerification({
        livenessConfidence: LIVENESS_CONFIDENCE - 0.1,
        similarity: MATCH_SIMILARITY,
        ...on,
      }).outcome,
    ).toBe("needs-a-person");
    expect(
      decideVerification({
        livenessConfidence: LIVENESS_CONFIDENCE,
        similarity: MATCH_SIMILARITY - 0.1,
        ...on,
      }).outcome,
    ).toBe("needs-a-person");
  });

  it("distinguishes 'could not check' from 'checked and failed'", () => {
    // The distinction a reviewer acts on. Both are needs-a-person; only one is
    // a signal about the applicant.
    expect(decideVerification({ livenessConfidence: null, similarity: 99, ...on }).livenessPassed)
      .toBeNull();
    expect(decideVerification({ livenessConfidence: 99, similarity: null, ...on }).livenessPassed)
      .toBeNull();
    expect(decideVerification({ livenessConfidence: 10, similarity: 99, ...on }).livenessPassed)
      .toBe(false);
  });

  it("with auto-admit off, a perfect pair still goes to a person", () => {
    const d = decideVerification({
      livenessConfidence: 99,
      similarity: 99,
      autoAdmitEnabled: false,
    });
    expect(d.outcome).toBe("needs-a-person");
    // But the fact that both passed is still recorded, so the reviewer sees it.
    expect(d.livenessPassed).toBe(true);
  });
});

describe("reviewVerdict — what the reviewer is told", () => {
  const row = (over: Partial<Parameters<typeof reviewVerdict>[0]> = {}) => ({
    livenessPassed: null,
    livenessScore: null,
    challengePassed: null,
    autoReason: null,
    ...over,
  });

  it("says a check that did not run did not run", () => {
    const v = reviewVerdict(row());
    expect(v.label).toBe("Not checked");
    expect(v.detail).toContain("not a failed check");
  });

  it("never presents a null as a failure, whatever else is on the row", () => {
    // The distinction the three-valued column exists for. A score can be left
    // over from an earlier attempt while the verdict itself is null.
    const v = reviewVerdict(row({ livenessScore: 40, challengePassed: false }));
    expect(v.label).toBe("Not checked");
    expect(v.tone).toBe("quiet");
  });

  it("shows a confident match with its number", () => {
    const v = reviewVerdict(row({ livenessPassed: true, livenessScore: 96.4 }));
    expect(v.label).toBe("Matched 96/100");
    expect(v.tone).toBe("good");
  });

  it("names the two failures differently, because they mean different things", () => {
    const sequence = reviewVerdict(row({ livenessPassed: false, challengePassed: false }));
    const weak = reviewVerdict(
      row({ livenessPassed: false, challengePassed: true, livenessScore: 71 }),
    );
    expect(sequence.label).toBe("Liveness not convincing");
    expect(weak.label).toBe("Weak match 71/100");
  });

  it("never tells a reviewer the machine rejected anybody", () => {
    for (const livenessPassed of [true, false, null]) {
      for (const challengePassed of [true, false, null]) {
        for (const livenessScore of [null, 0, 71, 100]) {
          const v = reviewVerdict(row({ livenessPassed, challengePassed, livenessScore }));
          expect(`${v.label} ${v.detail}`.toLowerCase()).not.toContain("reject");
        }
      }
    }
  });

  it("prefers the stored reason over the generic one", () => {
    const v = reviewVerdict(row({ livenessPassed: false, autoReason: "Matched at 61, under 92." }));
    expect(v.detail).toBe("Matched at 61, under 92.");
  });
});
