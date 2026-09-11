import { describe, expect, it } from "vitest";
import { MIN_AGE } from "@noghost/config";
import {
  APPLICATION_STEPS,
  FINAL_STEP,
  OPTIONAL_STEPS,
  completionRatio,
  isSubmittable,
  nextIncompleteStep,
  normalizePhone,
  validateAbout,
  validateAgree,
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

/** The birthdate of somebody who turns exactly `age` on NOW. */
function birthdateForAge(age: number): string {
  const now = new Date(NOW);
  return `${now.getUTCFullYear() - age}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(
    now.getUTCDate(),
  ).padStart(2, "0")}`;
}

const dayAfter = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** The minimum that satisfies each step, so the walkthrough can advance. */
const satisfy: Record<string, Partial<ApplicationDraft>> = {
  phone: { phone: "+14045550134", email: "maya@example.com", consentedAt: NOW },
  verify: { phoneVerifiedAt: NOW },
  selfie: { selfiePath: "selfie.jpg" },
  about: { firstName: "Maya", birthdate: "1994-03-02", gender: "woman", seeking: ["man"] },
  preferences: {
    point: { lat: 33.782, lng: -84.384 },
    travelRadiusKm: 25,
    ageMin: 28,
    ageMax: 40,
  },
  interests: { interests: ["live music", "running", "coffee", "film", "cooking"] },
  photos: { photoPaths: ["a.webp", "b.webp", "c.webp"] },
  prompts: {
    prompts: [
      { prompt_id: "prompt_01", answer: "I know which Publix to avoid on a Sunday." },
      { prompt_id: "prompt_04", answer: "I remember what you told me last time." },
      { prompt_id: "prompt_11", answer: "Grits do not need sugar." },
    ],
  },
  voice: { voiceSeenAt: NOW },
  agree: { agreedAt: NOW },
};

function complete(overrides: Partial<ApplicationDraft> = {}): ApplicationDraft {
  return {
    phone: "+14045550134",
    email: "maya@example.com",
    consentedAt: NOW,
    phoneVerifiedAt: NOW,
    firstName: "Maya",
    birthdate: "1994-03-02",
    gender: "woman",
    seeking: ["man"],
    neighborhood: "Midtown",
    point: { lat: 33.782, lng: -84.384 },
    travelRadiusKm: 25,
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
    agreedAt: NOW,
    selfiePath: "selfie.jpg",
    ...overrides,
  };
}

describe("phone", () => {
  const good = { phone: "+14045550134", email: "maya@example.com", consentedAt: NOW };

  it("requires E.164, an address, and the consent confirmation", () => {
    expect(validatePhone(good)).toEqual({ ok: true });
    expect(validatePhone({ ...good, phone: "404-555-0134" }).ok).toBe(false);
    expect(validatePhone({ ...good, consentedAt: undefined }).ok).toBe(false);
  });

  it("needs an email, because every §9.5 mail has nowhere to go without one", () => {
    // §7.4: "Email captured at application for receipts/comms." It never was —
    // the funnel created phone-only accounts and the four email templates in §8
    // had no recipient at all.
    expect(validatePhone({ ...good, email: undefined }).ok).toBe(false);
    expect(validatePhone({ ...good, email: "not-an-address" }).ok).toBe(false);
    expect(validatePhone({ ...good, email: "no@domain" }).ok).toBe(false);
  });

  it("does not refuse addresses that are merely unusual", () => {
    // A stricter pattern rejects real people on the first screen. Bouncing mail
    // is the check that actually knows.
    for (const email of [
      "maya+noghost@example.com",
      "o'brien@example.co.uk",
      "someone@sub.domain.museum",
    ]) {
      expect(validatePhone({ ...good, email })).toEqual({ ok: true });
    }
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

  it("turns away anyone under the floor with a route to the waitlist, not a dead end", () => {
    // Dated from MIN_AGE rather than written as 2008. The floor moved from 21
    // to 18 and three tests kept asserting 21 — a hardcoded date is how an
    // age check stops testing the age it is supposed to.
    const dayBefore = birthdateForAge(MIN_AGE - 1);
    const result = validateAbout(complete({ birthdate: dayBefore }), NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.birthdate).toMatch(/waitlist/);
  });

  it("admits somebody on the birthday that makes them eligible", () => {
    expect(validateAbout(complete({ birthdate: birthdateForAge(MIN_AGE) }), NOW))
      .toEqual({ ok: true });
    // One day younger: still a day short.
    expect(
      validateAbout(complete({ birthdate: dayAfter(birthdateForAge(MIN_AGE)) }), NOW).ok,
    ).toBe(false);
  });

  it("requires a name, a gender, and at least one seeking option", () => {
    expect(validateAbout(complete({ firstName: "  " }), NOW).ok).toBe(false);
    expect(validateAbout(complete({ gender: undefined }), NOW).ok).toBe(false);
    expect(validateAbout(complete({ seeking: [] }), NOW).ok).toBe(false);
  });
});

describe("preferences", () => {
  it("requires a location it can measure distance from", () => {
    // A name from a list only works in the city that list describes. The drop
    // scores on distance now, so the thing it needs is a point.
    expect(validatePreferences(complete(), NOW)).toEqual({ ok: true });
    expect(validatePreferences(complete({ point: undefined }), NOW).ok).toBe(false);
    // Null Island is what a failed geocode looks like.
    expect(validatePreferences(complete({ point: { lat: 0, lng: 0 } }), NOW).ok).toBe(false);
  });

  it("lets the neighbourhood be anything short, or nothing", () => {
    // It is the line under your name on the card — somebody describing
    // themselves, not the product locating them.
    expect(validatePreferences(complete({ neighborhood: "Alfama" }), NOW)).toEqual({ ok: true });
    expect(validatePreferences(complete({ neighborhood: undefined }), NOW)).toEqual({ ok: true });
    expect(validatePreferences(complete({ neighborhood: "x".repeat(61) }), NOW).ok).toBe(false);
  });

  it("only accepts a travel radius it offers", () => {
    expect(validatePreferences(complete({ travelRadiusKm: 25 }), NOW)).toEqual({ ok: true });
    expect(validatePreferences(complete({ travelRadiusKm: 23 }), NOW).ok).toBe(false);
  });

  it("rejects an inverted range, or one below the floor", () => {
    expect(validatePreferences(complete({ ageMin: 40, ageMax: 30 }), NOW).ok).toBe(false);
    expect(validatePreferences(complete({ ageMin: MIN_AGE - 1 }), NOW).ok).toBe(false);
    expect(validatePreferences(complete({ ageMin: MIN_AGE, ageMax: 40 }), NOW).ok).toBe(true);
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
    // sails past the voice step and is never asked.
    const { voiceSeenAt: _seen, ...everythingElse } = complete();
    expect(nextIncompleteStep(everythingElse, NOW)).toBe("voice");
  });

  it("does not ask twice once they have answered either way", () => {
    const declined = { ...complete({ selfiePath: undefined }), voiceIntroPath: undefined };
    expect(nextIncompleteStep(declined, NOW)).toBe("selfie");
  });

  it("is not required for submission", () => {
    expect(isSubmittable(complete({ voiceIntroPath: undefined }), NOW)).toBe(true);
  });
});

describe("the order of the funnel", () => {
  it("asks for the selfie immediately after the phone code", () => {
    // Not cosmetic. Last-place meant somebody who cannot pass identity
    // verification found out after eleven screens of work, and somebody who
    // can did all of it before anyone knew they were real.
    expect(APPLICATION_STEPS.slice(0, 3)).toEqual(["phone", "verify", "selfie"]);
  });

  it("ends on the agreement, not the optional voice intro", () => {
    // The funnel used to finish on a screen most people skip, so the final act
    // of applying was pressing Continue on something they had ignored.
    expect(APPLICATION_STEPS[APPLICATION_STEPS.length - 1]).toBe("agree");
    expect(OPTIONAL_STEPS).not.toContain("agree");
  });

  it("files the application on whatever step is genuinely last", () => {
    // `fileApplication` keys off this. When it was the literal "selfie",
    // moving that step to position three would have filed an application with
    // no photos, no prompts and no answers on it.
    expect(FINAL_STEP).toBe(APPLICATION_STEPS[APPLICATION_STEPS.length - 1]);
    expect(APPLICATION_STEPS.indexOf(FINAL_STEP)).toBe(APPLICATION_STEPS.length - 1);
  });

  it("still reaches every step on the way through", () => {
    const seen: string[] = [];
    let draft: ApplicationDraft = {};
    for (let i = 0; i < APPLICATION_STEPS.length + 2; i += 1) {
      const step = nextIncompleteStep(draft, NOW);
      if (!step) break;
      seen.push(step);
      draft = { ...draft, ...satisfy[step] };
    }
    expect(seen).toEqual([...APPLICATION_STEPS]);
  });
});

describe("the agreement", () => {
  it("is not satisfied by passing through", () => {
    // Unlike the voice step, this one has to be answered. A funnel that let
    // somebody Continue past the agreement would be collecting consent by
    // inactivity, which is not consent.
    expect(validateAgree({}).ok).toBe(false);
    expect(validateAgree({ agreedAt: NOW }).ok).toBe(true);
  });

  it("blocks submission on its own", () => {
    const { agreedAt: _dropped, ...everythingElse } = complete();
    expect(isSubmittable(everythingElse, NOW)).toBe(false);
    expect(nextIncompleteStep(everythingElse, NOW)).toBe("agree");
  });

  it("is separate from the consent that gated their phone number", () => {
    // Two moments, two records: one to start, one to send.
    const started = complete({ agreedAt: undefined });
    expect(started.consentedAt).toBeTruthy();
    expect(validateAgree(started).ok).toBe(false);
  });
});
