import { describe, expect, it } from "vitest";
import {
  APPLICATION_STEPS,
  OPTIONAL_STEPS,
  completionRatio,
  isSubmittable,
  nextIncompleteStep,
  normalizePhone,
  validateAbout,
  validateInterests,
  validatePhotos,
  validatePhone,
  validatePreferences,
  validatePrompts,
  validateSelfie,
  validateVoice,
  type ApplicationDraft,
} from "./application";

const NOW = "2026-08-01T12:00:00.000Z";

function complete(overrides: Partial<ApplicationDraft> = {}): ApplicationDraft {
  return {
    phone: "+14045550134",
    consentedAt: NOW,
    phoneVerifiedAt: NOW,
    firstName: "Maya",
    birthdate: "1994-03-02",
    gender: "woman",
    seeking: ["man"],
    neighborhood: "Midtown",
    ageMin: 28,
    ageMax: 40,
    interests: ["live music", "running", "coffee", "film", "cooking"],
    photoPaths: ["a.webp", "b.webp", "c.webp"],
    prompts: [
      { prompt_id: "prompt_01", answer: "I know which Publix to avoid on a Sunday." },
      { prompt_id: "prompt_04", answer: "I remember what you told me last time." },
      { prompt_id: "prompt_11", answer: "Grits do not need sugar." },
    ],
    voiceSeenAt: NOW,
    selfiePath: "selfie.jpg",
    ...overrides,
  };
}

describe("phone", () => {
  it("requires E.164 and the consent confirmation", () => {
    expect(validatePhone({ phone: "+14045550134", consentedAt: NOW })).toEqual({ ok: true });
    expect(validatePhone({ phone: "404-555-0134", consentedAt: NOW }).ok).toBe(false);
    expect(validatePhone({ phone: "+14045550134" }).ok).toBe(false);
  });
});

describe("normalizePhone", () => {
  it("assumes +1 for a bare US number", () => {
    expect(normalizePhone("(404) 555-0134")).toBe("+14045550134");
    expect(normalizePhone("1 404 555 0134")).toBe("+14045550134");
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("returns null rather than guessing at something unusable", () => {
    expect(normalizePhone("555-0134")).toBeNull();
    expect(normalizePhone("not a phone")).toBeNull();
  });
});

describe("about", () => {
  it("accepts a complete, eligible answer", () => {
    expect(validateAbout(complete(), NOW)).toEqual({ ok: true });
  });

  it("turns away under-21s with a route to the waitlist, not a dead end", () => {
    const result = validateAbout(complete({ birthdate: "2008-01-01" }), NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.birthdate).toMatch(/waitlist/);
  });

  it("admits someone on their 21st birthday", () => {
    expect(validateAbout(complete({ birthdate: "2005-08-01" }), NOW)).toEqual({ ok: true });
    expect(validateAbout(complete({ birthdate: "2005-08-02" }), NOW).ok).toBe(false);
  });

  it("requires a name, a gender, and at least one seeking option", () => {
    expect(validateAbout(complete({ firstName: "  " }), NOW).ok).toBe(false);
    expect(validateAbout(complete({ gender: undefined }), NOW).ok).toBe(false);
    expect(validateAbout(complete({ seeking: [] }), NOW).ok).toBe(false);
  });
});

describe("preferences", () => {
  it("requires a neighborhood from the pick-list", () => {
    expect(validatePreferences(complete(), NOW)).toEqual({ ok: true });
    expect(validatePreferences(complete({ neighborhood: "Brooklyn" }), NOW).ok).toBe(false);
  });

  it("rejects an inverted or under-21 range", () => {
    expect(validatePreferences(complete({ ageMin: 40, ageMax: 30 }), NOW).ok).toBe(false);
    expect(validatePreferences(complete({ ageMin: 18 }), NOW).ok).toBe(false);
  });

  it("warns when the range excludes the applicant's own age", () => {
    // Maya is 32; a 21-25 preference makes every match one-directional.
    const result = validatePreferences(complete({ ageMin: 21, ageMax: 25 }), NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.ageRange).toMatch(/one-directional/);
  });
});

describe("interests", () => {
  it("enforces the 5–10 window", () => {
    expect(validateInterests(complete())).toEqual({ ok: true });
    expect(validateInterests(complete({ interests: ["a", "b", "c", "d"] })).ok).toBe(false);
    expect(
      validateInterests(complete({ interests: Array.from({ length: 11 }, (_, i) => `i${i}`) })).ok,
    ).toBe(false);
  });
});

describe("photos", () => {
  it("enforces 3–6", () => {
    expect(validatePhotos(complete())).toEqual({ ok: true });
    expect(validatePhotos(complete({ photoPaths: ["a.webp", "b.webp"] })).ok).toBe(false);
    expect(
      validatePhotos(complete({ photoPaths: Array.from({ length: 7 }, (_, i) => `${i}.webp`) })).ok,
    ).toBe(false);
  });
});

describe("prompts", () => {
  it("requires exactly three distinct, real prompts", () => {
    expect(validatePrompts(complete())).toEqual({ ok: true });

    const two = complete().prompts!.slice(0, 2);
    expect(validatePrompts(complete({ prompts: two })).ok).toBe(false);

    const duplicated = [
      { prompt_id: "prompt_01", answer: "One answer here." },
      { prompt_id: "prompt_01", answer: "Another answer here." },
      { prompt_id: "prompt_04", answer: "A third answer here." },
    ];
    expect(validatePrompts(complete({ prompts: duplicated })).ok).toBe(false);

    const invented = [
      { prompt_id: "prompt_99", answer: "Not in the library at all." },
      { prompt_id: "prompt_04", answer: "A real one, answered." },
      { prompt_id: "prompt_11", answer: "Another real one." },
    ];
    expect(validatePrompts(complete({ prompts: invented })).ok).toBe(false);
  });

  it("rejects an answer too thin to reply to", () => {
    const thin = complete().prompts!.map((p, i) => (i === 0 ? { ...p, answer: "yes" } : p));
    const result = validatePrompts(complete({ prompts: thin }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.prompt_01).toMatch(/few more words/);
  });

  it("ignores blank answers rather than counting them", () => {
    const withBlank = [...complete().prompts!, { prompt_id: "prompt_07", answer: "   " }];
    expect(validatePrompts(complete({ prompts: withBlank })).ok).toBe(true);
  });
});

describe("selfie", () => {
  it("is required", () => {
    expect(validateSelfie(complete())).toEqual({ ok: true });
    expect(validateSelfie(complete({ selfiePath: undefined })).ok).toBe(false);
  });
});

describe("resuming a half-finished application", () => {
  it("sends an empty draft to the first step", () => {
    expect(nextIncompleteStep({}, NOW)).toBe("phone");
  });

  it("sends a part-done draft to the first gap", () => {
    const partial = complete({ interests: undefined, photoPaths: undefined });
    expect(nextIncompleteStep(partial, NOW)).toBe("interests");
  });

  it("reports a complete draft as submittable", () => {
    expect(nextIncompleteStep(complete(), NOW)).toBeNull();
    expect(isSubmittable(complete(), NOW)).toBe(true);
  });

  it("tracks progress from 0 to 1", () => {
    const required = APPLICATION_STEPS.length - OPTIONAL_STEPS.length;

    expect(completionRatio({}, NOW)).toBe(0);
    expect(completionRatio(complete(), NOW)).toBe(1);
    expect(completionRatio(complete({ selfiePath: undefined }), NOW)).toBeCloseTo(
      (required - 1) / required,
    );
  });

  it("does not count the optional step as progress", () => {
    // Recording an intro is not work the applicant owes, so it must not move a
    // bar that claims to measure what is left to do.
    expect(OPTIONAL_STEPS.length).toBeGreaterThan(0);
    expect(completionRatio({ voiceIntroPath: "someone/intro.webm" }, NOW)).toBe(0);
    expect(completionRatio(complete({ voiceIntroPath: undefined }), NOW)).toBe(1);
  });
});

describe("the optional voice intro", () => {
  it("is satisfied by a recording or by passing through", () => {
    expect(validateVoice({ voiceIntroPath: "someone/intro.webm" }).ok).toBe(true);
    expect(validateVoice({ voiceSeenAt: NOW }).ok).toBe(true);
    expect(validateVoice({}).ok).toBe(false);
  });

  it("stops a resumed application so the offer is not silently retired", () => {
    // The bug this exists to prevent: an always-valid step is walked past by
    // `nextIncompleteStep`, so anyone returning to a half-finished application
    // goes prompts -> selfie and is never asked.
    const { voiceSeenAt: _seen, selfiePath: _selfie, ...upToPrompts } = complete();
    expect(nextIncompleteStep(upToPrompts, NOW)).toBe("voice");
  });

  it("does not ask twice once they have answered either way", () => {
    const declined = { ...complete({ selfiePath: undefined }), voiceIntroPath: undefined };
    expect(nextIncompleteStep(declined, NOW)).toBe("selfie");
  });

  it("is not required for submission", () => {
    expect(isSubmittable(complete({ voiceIntroPath: undefined }), NOW)).toBe(true);
  });
});
