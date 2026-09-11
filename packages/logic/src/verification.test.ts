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
    for (const livenessConfidence of [
      null, 0, LIVENESS_CONFIDENCE - 0.1, LIVENESS_CONFIDENCE, 100,
    ]) {
      for (const similarity of [null, 0, MATCH_SIMILARITY - 0.1, MATCH_SIMILARITY, 100]) {
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
    livenessConfidence: null,
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

  it("never presents a null verdict as a failure, whatever else is on the row", () => {
    const v = reviewVerdict(row({ livenessConfidence: 40, livenessScore: 40 }));
    expect(v.label).toBe("Not checked");
    expect(v.tone).toBe("quiet");
  });

  it("shows both numbers, always, when they exist", () => {
    const v = reviewVerdict(row({ livenessPassed: true, livenessConfidence: 91.2, livenessScore: 96.4 }));
    expect(v.liveness).toBe("91/100");
    expect(v.match).toBe("96/100");
  });

  it("keeps the two numbers apart — they answer different questions", () => {
    // A convincing stranger: unmistakably a live person, not the person in the
    // photographs. Collapsing these into one score loses exactly that case.
    const stranger = reviewVerdict(
      row({ livenessPassed: false, livenessConfidence: 98, challengePassed: true, livenessScore: 30 }),
    );
    expect(stranger.liveness).toBe("98/100");
    expect(stranger.match).toBe("30/100");
    expect(stranger.label).toContain("Match");
  });

  it("reports a low liveness score as a measurement, not a character judgement", () => {
    // The first genuine check through this system scored 64.6. A reviewer
    // reading "not convincing" above a real applicant's face has been told to
    // distrust them before they look.
    const v = reviewVerdict(
      row({ livenessPassed: false, livenessConfidence: 64.6, challengePassed: false, livenessScore: 95 }),
    );
    expect(v.label).toBe("Liveness 65/100 — your call");
    expect(v.label.toLowerCase()).not.toContain("not convincing");
    expect(v.detail).toContain("threshold we set");
    expect(v.detail).toContain("Bad light");
  });

  it("names which line was missed, so the reviewer knows what to look at", () => {
    const weakLive = reviewVerdict(
      row({ livenessPassed: false, livenessConfidence: 40, challengePassed: false, livenessScore: 99 }),
    );
    const weakMatch = reviewVerdict(
      row({ livenessPassed: false, livenessConfidence: 99, challengePassed: true, livenessScore: 40 }),
    );
    expect(weakLive.label).toContain("Liveness");
    expect(weakMatch.label).toContain("Match");
    expect(weakLive.label).not.toBe(weakMatch.label);
  });

  it("never tells a reviewer the machine rejected anybody", () => {
    for (const livenessPassed of [true, false, null]) {
      for (const challengePassed of [true, false, null]) {
        for (const livenessConfidence of [null, 0, 64.6, 100]) {
          for (const livenessScore of [null, 0, 71, 100]) {
            const v = reviewVerdict(
              row({ livenessPassed, challengePassed, livenessConfidence, livenessScore }),
            );
            const text = `${v.label} ${v.detail}`.toLowerCase();
            expect(text).not.toContain("reject");
            /*
             * Phrases that assert a failure, rather than the word "fail" — the
             * one legitimate use is "this is NOT a failed check", which says
             * the opposite and must survive.
             */
            for (const accusation of [
              "not convincing",
              "check failed",
              "failed liveness",
              "failed the",
              "did not pass",
            ]) {
              expect(text).not.toContain(accusation);
            }
          }
        }
      }
    }
  });

  it("prefers the stored reason over the generic one", () => {
    const v = reviewVerdict(
      row({ livenessPassed: false, livenessConfidence: 90, autoReason: "Live at 90, matched at 61." }),
    );
    expect(v.detail).toBe("Live at 90, matched at 61.");
  });
});
