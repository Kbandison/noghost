import { describe, expect, it } from "vitest";
import {
  MIN_FACE_SHARE,
  REFUSE_NOT_PHOTO_CONFIDENCE,
  REFUSE_CONFIDENCE,
  decidePhoto,
  decidePhotoSet,
  type PhotoReading,
} from "./photo-moderation";

/** A clean portrait: one clear face, nothing flagged. */
const clean = (over: Partial<PhotoReading> = {}): PhotoReading => ({
  flags: [],
  contentTypes: [],
  faceCount: 1,
  faceShare: 0.3,
  faceConfidence: 99,
  ...over,
});

describe("decidePhoto", () => {
  it("approves an ordinary portrait", () => {
    expect(decidePhoto(clean()).verdict).toBe("ok");
  });

  it("refuses explicit content outright", () => {
    const d = decidePhoto(
      clean({ flags: [{ name: "Exposed Male Genitalia", parent: "Explicit", confidence: 97 }] }),
    );
    expect(d.verdict).toBe("refuse");
  });

  it("never repeats the leaf label back to the applicant", () => {
    // The category is what somebody needs to know. The leaf label is a
    // description of their body that a computer wrote and nobody asked for.
    const d = decidePhoto(
      clean({ flags: [{ name: "Exposed Male Genitalia", parent: "Explicit", confidence: 97 }] }),
    );
    expect(d.reason).not.toContain("Genitalia");
    expect(d.reason.toLowerCase()).toContain("explicit");
  });

  it("does not refuse explicit content it is unsure about", () => {
    const d = decidePhoto(
      clean({
        flags: [{ name: "Explicit Nudity", parent: "Explicit", confidence: REFUSE_CONFIDENCE - 1 }],
      }),
    );
    expect(d.verdict).toBe("needs-a-person");
  });

  it("flags swimwear and alcohol rather than refusing them", () => {
    // A beach photo and a glass of wine are ordinary on a dating profile.
    // Deleting them silently would be the product being prudish.
    for (const parent of ["Swimwear or Underwear", "Alcohol", "Tobacco", "Rude Gestures"]) {
      const d = decidePhoto(clean({ flags: [{ name: "x", parent, confidence: 95 }] }));
      expect(d.verdict).toBe("needs-a-person");
    }
  });

  it("keeps working when AWS renames the taxonomy's leaves", () => {
    // Matched on the top-level category by substring, so a version bump that
    // renames leaf labels does not silently stop refusing anything.
    const d = decidePhoto(
      clean({ flags: [{ name: "Some Label We Have Never Seen", parent: "Explicit", confidence: 99 }] }),
    );
    expect(d.verdict).toBe("refuse");
  });

  it("catches a cartoon through the content type", () => {
    // Confident enough to refuse; see "refusing at the door" below.
    const sure = decidePhoto(clean({ contentTypes: [{ name: "Animated", confidence: 96 }] }));
    expect(sure.verdict).toBe("refuse");

    // Fairly sure only — flagged, and the reason names what it looked like.
    const unsure = decidePhoto(clean({ contentTypes: [{ name: "Animated", confidence: 70 }] }));
    expect(unsure.verdict).toBe("needs-a-person");
    expect(unsure.reason.toLowerCase()).toContain("animated");
  });

  it("sends a photo with no face to a person", () => {
    expect(decidePhoto(clean({ faceCount: 0 })).verdict).toBe("needs-a-person");
  });

  it("sends a group shot to a person rather than refusing it", () => {
    // Plenty of people's best photo has a friend in it. Somebody should decide
    // which face is theirs before it leads their card.
    const d = decidePhoto(clean({ faceCount: 3 }));
    expect(d.verdict).toBe("needs-a-person");
    expect(d.reason).toContain("3 faces");
  });

  it("sends a face too small to compare to a person", () => {
    expect(decidePhoto(clean({ faceShare: MIN_FACE_SHARE - 0.01 })).verdict).toBe("needs-a-person");
    expect(decidePhoto(clean({ faceShare: MIN_FACE_SHARE })).verdict).toBe("ok");
  });

  it("treats no reading as unchecked, not as clean", () => {
    const d = decidePhoto(null);
    expect(d.verdict).toBe("needs-a-person");
    expect(d.reason).toContain("No automated check");
  });

  it("never refuses for any reason other than explicit content", () => {
    const reasons: string[] = [];
    for (const parent of ["Violence", "Drugs", "Gambling", "Hate Symbols", "Alcohol", null]) {
      for (const confidence of [60, 85, 99]) {
        const d = decidePhoto(clean({ flags: [{ name: "x", parent, confidence }] }));
        if (d.verdict === "refuse") reasons.push(`${parent}@${confidence}`);
      }
    }
    expect(reasons).toEqual([]);
  });
});

describe("decidePhotoSet — approval is all or nothing", () => {
  it("approves a set where every photo is clean", () => {
    expect(decidePhotoSet([clean(), clean(), clean()]).verdict).toBe("ok");
  });

  it("one questionable photo sends the whole set to a person", () => {
    // Once somebody is looking they should decide about all of them together,
    // not inherit a machine's partial verdict on the rest.
    expect(decidePhotoSet([clean(), clean({ faceCount: 0 }), clean()]).verdict)
      .toBe("needs-a-person");
  });

  it("one explicit photo refuses the set", () => {
    const set = decidePhotoSet([
      clean(),
      clean({ flags: [{ name: "x", parent: "Explicit", confidence: 99 }] }),
    ]);
    expect(set.verdict).toBe("refuse");
    expect(set.perPhoto[0]!.verdict).toBe("ok");
    expect(set.perPhoto[1]!.verdict).toBe("refuse");
  });

  it("an empty set is never approved", () => {
    expect(decidePhotoSet([]).verdict).toBe("needs-a-person");
  });
});

describe("refusing at the door", () => {
  const clean2 = (over: Partial<PhotoReading> = {}): PhotoReading => ({
    flags: [], contentTypes: [], faceCount: 1, faceShare: 0.3, faceConfidence: 99, ...over,
  });

  it("refuses a cartoon outright, and says what to do instead", () => {
    const d = decidePhoto(clean2({ contentTypes: [{ name: "Illustrated", confidence: 96 }] }));
    expect(d.verdict).toBe("refuse");
    expect(d.reason).toContain("real photos of you");
  });

  it("only flags something it is merely fairly sure is a drawing", () => {
    // A heavy filter, a black-and-white portrait or a studio backdrop can read
    // as illustrated. Refusing a real photograph of a real person is the
    // mistake worth avoiding here, so the bar is higher than for explicit.
    const d = decidePhoto(
      clean2({ contentTypes: [{ name: "Illustrated", confidence: REFUSE_NOT_PHOTO_CONFIDENCE - 1 }] }),
    );
    expect(d.verdict).toBe("needs-a-person");
  });

  it("every refusal tells the applicant what to do next", () => {
    const refusals = [
      clean2({ flags: [{ name: "x", parent: "Explicit", confidence: 99 }] }),
      clean2({ contentTypes: [{ name: "Animated", confidence: 99 }] }),
    ].map(decidePhoto);

    for (const d of refusals) {
      expect(d.verdict).toBe("refuse");
      // A refusal with no instruction is a dead end. Each one names a next
      // action, because the applicant has the picker open right now.
      expect(/pick a different one|need real photos of you/i.test(d.reason)).toBe(true);
    }
  });

  it("still refuses for only those two reasons", () => {
    const refused: string[] = [];
    for (const reading of [
      clean2({ faceCount: 0 }),
      clean2({ faceCount: 4 }),
      clean2({ faceShare: 0.01 }),
      clean2({ faceConfidence: 50 }),
      clean2({ flags: [{ name: "x", parent: "Violence", confidence: 99 }] }),
      clean2({ flags: [{ name: "x", parent: "Alcohol", confidence: 99 }] }),
      null,
    ]) {
      const d = decidePhoto(reading);
      if (d.verdict === "refuse") refused.push(d.reason);
    }
    expect(refused).toEqual([]);
  });
});
