import { describe, expect, it } from "vitest";
import {
  CHALLENGE_LENGTH,
  MATCH_SIMILARITY,
  buildChallenge,
  challengePassed,
  decideVerification,
  poseSatisfied,
  reviewVerdict,
  turnsOppose,
  type ChallengePose,
  type FaceReading,
} from "./verification";
import { seededRandom, hashSeed } from "./random";

const face = (over: Partial<FaceReading> = {}): FaceReading => ({
  faceCount: 1,
  yaw: 0,
  pitch: 0,
  eyesOpen: true,
  smiling: false,
  confidence: 99,
  ...over,
});

describe("buildChallenge", () => {
  const random = seededRandom(hashSeed("challenge"));

  it("always starts with a centered frame — that is the one compared to the photos", () => {
    for (let i = 0; i < 50; i += 1) expect(buildChallenge(random)[0]).toBe("center");
  });

  it("always contains at least one turn", () => {
    for (let i = 0; i < 50; i += 1) {
      const poses = buildChallenge(random);
      expect(poses.some((p) => p === "left" || p === "right")).toBe(true);
    }
  });

  it("is the stated length", () => {
    for (let i = 0; i < 20; i += 1) {
      expect(buildChallenge(random)).toHaveLength(CHALLENGE_LENGTH);
    }
  });

  it("varies, so a previous attempt does not tell you the next one", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(buildChallenge(random).join(","));
    // Six orderings are reachable; anything under three means the shuffle is
    // stuck and a recorded reply would work every time.
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it("never asks for the same pose twice in the tail", () => {
    for (let i = 0; i < 100; i += 1) {
      const [, second, third] = buildChallenge(random);
      expect(second).not.toBe(third);
    }
  });
});

describe("poseSatisfied", () => {
  it("accepts a centered face", () => {
    expect(poseSatisfied("center", face())).toBe(true);
  });

  it("rejects a centered pose that is turned away", () => {
    expect(poseSatisfied("center", face({ yaw: 30 }))).toBe(false);
  });

  it("rejects a centered pose with closed eyes", () => {
    expect(poseSatisfied("center", face({ eyesOpen: false }))).toBe(false);
  });

  it("accepts a turn in either sign — the convention is undocumented", () => {
    expect(poseSatisfied("left", face({ yaw: 25 }))).toBe(true);
    expect(poseSatisfied("left", face({ yaw: -25 }))).toBe(true);
  });

  it("rejects a glance that is not a turn", () => {
    expect(poseSatisfied("right", face({ yaw: 10 }))).toBe(false);
  });

  it("rejects two faces — a held-up photograph, or a bystander", () => {
    expect(poseSatisfied("center", face({ faceCount: 2 }))).toBe(false);
  });

  it("rejects no face at all", () => {
    expect(poseSatisfied("center", face({ faceCount: 0 }))).toBe(false);
    expect(poseSatisfied("center", null)).toBe(false);
  });

  it("rejects a low-confidence detection", () => {
    expect(poseSatisfied("center", face({ confidence: 80 }))).toBe(false);
  });

  it("checks a smile as a smile", () => {
    expect(poseSatisfied("smile", face({ smiling: true }))).toBe(true);
    expect(poseSatisfied("smile", face({ smiling: false }))).toBe(false);
  });
});

describe("turnsOppose — the check a photograph cannot pass", () => {
  const poses: ChallengePose[] = ["center", "left", "right"];

  it("passes when the two turns go opposite ways", () => {
    expect(turnsOppose(poses, [face(), face({ yaw: -30 }), face({ yaw: 28 })])).toBe(true);
  });

  it("fails when both turns lean the same way — one profile photo, used twice", () => {
    expect(turnsOppose(poses, [face(), face({ yaw: 30 }), face({ yaw: 28 })])).toBe(false);
  });

  it("fails when a turn frame is dead centre", () => {
    expect(turnsOppose(poses, [face(), face({ yaw: 0 }), face({ yaw: 28 })])).toBe(false);
  });

  it("is vacuously true when only one turn was asked for", () => {
    expect(turnsOppose(["center", "left", "smile"], [face(), face({ yaw: 30 }), face()])).toBe(true);
  });
});

describe("challengePassed", () => {
  const poses: ChallengePose[] = ["center", "left", "right"];
  const good = [face(), face({ yaw: -30 }), face({ yaw: 30 })];

  it("passes a full honest answer", () => {
    expect(challengePassed(poses, good)).toBe(true);
  });

  it("fails when a frame is missing", () => {
    expect(challengePassed(poses, [face(), null, face({ yaw: 30 })])).toBe(false);
  });

  it("fails when the frame count does not match the sequence", () => {
    expect(challengePassed(poses, [face(), face({ yaw: -30 })])).toBe(false);
  });

  it("fails on an empty sequence rather than passing it", () => {
    expect(challengePassed([], [])).toBe(false);
  });

  it("fails when the turns both go the same way, even though each frame is fine", () => {
    expect(challengePassed(poses, [face(), face({ yaw: 30 }), face({ yaw: 30 })])).toBe(false);
  });
});

describe("decideVerification — never rejects", () => {
  const on = { autoAdmitEnabled: true };

  it("auto-admits a confident match", () => {
    const d = decideVerification({ challengeOk: true, similarity: 97, ...on });
    expect(d.outcome).toBe("auto-admit");
    expect(d.livenessPassed).toBe(true);
  });

  it("sends a weak match to a person, and does not reject it", () => {
    const d = decideVerification({ challengeOk: true, similarity: 60, ...on });
    expect(d.outcome).toBe("needs-a-person");
    expect(d.livenessPassed).toBe(false);
    expect(d.reason).toContain("60");
  });

  it("sends a failed sequence to a person, and does not reject it", () => {
    const d = decideVerification({ challengeOk: false, similarity: 99, ...on });
    expect(d.outcome).toBe("needs-a-person");
  });

  it("never returns any outcome other than admit or review", () => {
    const outcomes = new Set<string>();
    for (const challengeOk of [true, false, null]) {
      for (const similarity of [null, 0, 50, 91.9, 92, 100]) {
        for (const autoAdmitEnabled of [true, false]) {
          outcomes.add(
            decideVerification({ challengeOk, similarity, autoAdmitEnabled }).outcome,
          );
        }
      }
    }
    expect([...outcomes].sort()).toEqual(["auto-admit", "needs-a-person"]);
  });

  it("holds the threshold exactly — 92 passes, a hair under does not", () => {
    expect(decideVerification({ challengeOk: true, similarity: MATCH_SIMILARITY, ...on }).outcome)
      .toBe("auto-admit");
    expect(
      decideVerification({ challengeOk: true, similarity: MATCH_SIMILARITY - 0.1, ...on }).outcome,
    ).toBe("needs-a-person");
  });

  it("distinguishes 'could not check' from 'checked and failed'", () => {
    // The distinction a reviewer acts on. Both are needs-a-person; only one is
    // a signal about the applicant.
    expect(decideVerification({ challengeOk: null, similarity: 99, ...on }).livenessPassed)
      .toBeNull();
    expect(decideVerification({ challengeOk: true, similarity: null, ...on }).livenessPassed)
      .toBeNull();
    expect(decideVerification({ challengeOk: false, similarity: 99, ...on }).livenessPassed)
      .toBe(false);
  });

  it("with auto-admit off, a perfect match still goes to a person", () => {
    const d = decideVerification({ challengeOk: true, similarity: 99, autoAdmitEnabled: false });
    expect(d.outcome).toBe("needs-a-person");
    // But the fact that it matched is still recorded, so the reviewer sees it.
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
    expect(sequence.label).toBe("Sequence not answered");
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
