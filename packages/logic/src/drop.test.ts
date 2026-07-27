import { describe, expect, it } from "vitest";
import {
  buildDrop,
  isEncoreEligible,
  median,
  orientationMatches,
  ageRangeMatches,
  type BuildDropInput,
  type PoolProfile,
} from "./drop";

const NOW = "2026-09-14T20:00:00.000Z";
const SEASON_START = "2026-09-14T00:00:00.000Z";

const SEASON = { startsAt: SEASON_START, dropMax: 3, encoreStartWeek: 5 };

function profile(id: string, overrides: Partial<PoolProfile> = {}): PoolProfile {
  return {
    id,
    gender: "woman",
    seeking: ["man"],
    birthdate: "1996-01-01",
    ageMin: 21,
    ageMax: 99,
    neighborhood: "Midtown",
    interests: [],
    status: "active",
    incomingConnectsThisWeek: 0,
    ...overrides,
  };
}

function input(overrides: Partial<BuildDropInput> = {}): BuildDropInput {
  return {
    season: SEASON,
    dropDate: "2026-09-14",
    now: NOW,
    viewer: profile("viewer", { gender: "man", seeking: ["woman"] }),
    pool: [],
    seenProfileIds: [],
    passedHistory: [],
    connectedProfileIds: [],
    blockedProfileIds: [],
    ...overrides,
  };
}

describe("orientationMatches", () => {
  it("requires the match to hold in both directions", () => {
    const man = profile("m", { gender: "man", seeking: ["woman"] });
    const woman = profile("w", { gender: "woman", seeking: ["man"] });
    expect(orientationMatches(man, woman)).toBe(true);

    const womanSeekingWomen = profile("w2", { gender: "woman", seeking: ["woman"] });
    expect(orientationMatches(man, womanSeekingWomen)).toBe(false);
  });

  it("handles multi-select seeking", () => {
    const nb = profile("nb", { gender: "nonbinary", seeking: ["man", "woman", "nonbinary"] });
    const man = profile("m", { gender: "man", seeking: ["woman", "nonbinary"] });
    expect(orientationMatches(nb, man)).toBe(true);
  });
});

describe("ageRangeMatches", () => {
  it("excludes when either side's stated range is violated", () => {
    // viewer is 30, candidate is 45
    const viewer = profile("v", { birthdate: "1996-01-01", ageMin: 25, ageMax: 35 });
    const older = profile("o", { birthdate: "1981-01-01", ageMin: 21, ageMax: 99 });
    expect(ageRangeMatches(viewer, older, NOW)).toBe(false);

    // symmetric: candidate's range excludes the viewer
    const picky = profile("p", { birthdate: "1996-01-01", ageMin: 40, ageMax: 50 });
    expect(ageRangeMatches(viewer, picky, NOW)).toBe(false);
  });

  it("is inclusive at the boundaries", () => {
    const viewer = profile("v", { birthdate: "1996-01-01", ageMin: 30, ageMax: 30 });
    const same = profile("s", { birthdate: "1996-06-01", ageMin: 30, ageMax: 30 });
    expect(ageRangeMatches(viewer, same, NOW)).toBe(true);
  });
});

describe("median", () => {
  it("averages the middle two on even-length lists", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([])).toBe(0);
  });
});

describe("buildDrop eligibility", () => {
  it("excludes non-active members", () => {
    const result = buildDrop(
      input({
        pool: [
          profile("a", { status: "paused" }),
          profile("b", { status: "found_someone" }),
          profile("c", { status: "removed" }),
        ],
      }),
    );
    expect(result.quietNight).toBe(true);
    expect(result.cards).toHaveLength(0);
  });

  it("excludes anyone with a connect in either direction, in any status", () => {
    const result = buildDrop(
      input({ pool: [profile("a")], connectedProfileIds: ["a"] }),
    );
    expect(result.eligibleCount).toBe(0);
  });

  it("excludes anyone involved in a report, in either direction", () => {
    const result = buildDrop(input({ pool: [profile("a")], blockedProfileIds: ["a"] }));
    expect(result.eligibleCount).toBe(0);
  });

  it("excludes profiles already shown, when not encore-eligible", () => {
    const result = buildDrop(input({ pool: [profile("a")], seenProfileIds: ["a"] }));
    expect(result.eligibleCount).toBe(0);
  });

  it("never serves the viewer their own profile", () => {
    const viewer = profile("viewer", { gender: "man", seeking: ["man"] });
    const result = buildDrop(input({ viewer, pool: [viewer] }));
    expect(result.cards).toHaveLength(0);
  });
});

describe("buildDrop serve rules", () => {
  it("serves at most drop_max", () => {
    const pool = Array.from({ length: 10 }, (_, i) => profile(`p${i}`));
    const result = buildDrop(input({ pool }));
    expect(result.cards).toHaveLength(3);
    expect(result.eligibleCount).toBe(10);
  });

  it("serves fewer than three rather than padding, as the pool thins", () => {
    const result = buildDrop(input({ pool: [profile("a"), profile("b")] }));
    expect(result.cards).toHaveLength(2);
    expect(result.quietNight).toBe(false);
  });

  it("reports a quiet night when nothing is eligible", () => {
    const result = buildDrop(input({ pool: [] }));
    expect(result).toMatchObject({ quietNight: true, eligibleCount: 0 });
    expect(result.cards).toEqual([]);
  });

  it("respects a season configured for a different drop_max", () => {
    const pool = Array.from({ length: 5 }, (_, i) => profile(`p${i}`));
    const result = buildDrop(input({ pool, season: { ...SEASON, dropMax: 1 } }));
    expect(result.cards).toHaveLength(1);
  });
});

describe("buildDrop scoring", () => {
  it("ranks a shared neighborhood cluster above a distant one", () => {
    const result = buildDrop(
      input({
        viewer: profile("viewer", {
          gender: "man",
          seeking: ["woman"],
          neighborhood: "Midtown", // in-town
        }),
        pool: [
          profile("far", { neighborhood: "Alpharetta" }), // otp-north
          profile("near", { neighborhood: "Inman Park" }), // in-town
        ],
        season: { ...SEASON, dropMax: 1 },
      }),
    );
    expect(result.cards[0]?.profileId).toBe("near");
  });

  it("caps interest overlap at +3", () => {
    const interests = ["a", "b", "c", "d", "e", "f"];
    const result = buildDrop(
      input({
        viewer: profile("viewer", { gender: "man", seeking: ["woman"], interests }),
        pool: [profile("many", { interests, neighborhood: null })],
      }),
    );
    // +3 interests (capped) and no activity bonus — the lone candidate is the median.
    expect(result.cards[0]?.score).toBe(3);
  });

  it("gives the activity-balance nudge to the quieter inbox", () => {
    const result = buildDrop(
      input({
        pool: [
          profile("busy", { incomingConnectsThisWeek: 10, neighborhood: null }),
          profile("quiet", { incomingConnectsThisWeek: 0, neighborhood: null }),
          profile("mid", { incomingConnectsThisWeek: 5, neighborhood: null }),
        ],
        season: { ...SEASON, dropMax: 1 },
      }),
    );
    expect(result.cards[0]?.profileId).toBe("quiet");
    expect(result.cards[0]?.reasons).toContain("+2 activity balance");
  });

  it("never suppresses a profile for being passed on — only the inbox nudge looks sideways", () => {
    // 'unpopular' has been passed on by everyone; nothing in the scorer knows or cares.
    const result = buildDrop(
      input({
        pool: [profile("unpopular", { incomingConnectsThisWeek: 0, neighborhood: null })],
      }),
    );
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.score).toBeGreaterThanOrEqual(0);
  });
});

describe("buildDrop determinism", () => {
  it("produces identical output for identical input, so the cron can re-run", () => {
    const pool = Array.from({ length: 12 }, (_, i) =>
      profile(`p${i}`, { neighborhood: null }),
    );
    const a = buildDrop(input({ pool }));
    const b = buildDrop(input({ pool }));
    expect(a.cards).toEqual(b.cards);
  });

  it("varies the tiebreak by user and by date", () => {
    const pool = Array.from({ length: 12 }, (_, i) =>
      profile(`p${i}`, { neighborhood: null }),
    );
    const day1 = buildDrop(input({ pool, dropDate: "2026-09-14" }));
    const day2 = buildDrop(input({ pool, dropDate: "2026-09-15" }));
    const other = buildDrop(
      input({
        pool,
        viewer: profile("someone-else", { gender: "man", seeking: ["woman"] }),
      }),
    );

    const ids = (r: typeof day1) => r.cards.map((c) => c.profileId).join(",");
    expect(ids(day1)).not.toBe(ids(day2));
    expect(ids(day1)).not.toBe(ids(other));
  });

  it("does not depend on the order the pool arrives in", () => {
    const pool = Array.from({ length: 12 }, (_, i) =>
      profile(`p${i}`, { neighborhood: null, incomingConnectsThisWeek: i }),
    );
    const forward = buildDrop(input({ pool }));
    const reversed = buildDrop(input({ pool: [...pool].reverse() }));
    expect(new Set(forward.cards.map((c) => c.profileId))).toEqual(
      new Set(reversed.cards.map((c) => c.profileId)),
    );
  });
});

describe("encore drops", () => {
  const WEEK_5 = "2026-10-15T20:00:00.000Z"; // ~31 days in

  it("is closed before the configured encore week", () => {
    expect(isEncoreEligible("a", [{ profileId: "a", week: 1 }], 4, 5)).toBe(false);
  });

  it("opens from the encore week for weeks 1-2 passes only", () => {
    expect(isEncoreEligible("a", [{ profileId: "a", week: 2 }], 5, 5)).toBe(true);
    expect(isEncoreEligible("a", [{ profileId: "a", week: 3 }], 5, 5)).toBe(false);
  });

  it("re-serves a week-1 pass in week 5, flagged as an encore", () => {
    const result = buildDrop(
      input({
        now: WEEK_5,
        dropDate: "2026-10-15",
        pool: [profile("passed-on")],
        seenProfileIds: ["passed-on"],
        passedHistory: [{ profileId: "passed-on", week: 1 }],
      }),
    );
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toMatchObject({ profileId: "passed-on", isEncore: true });
  });

  it("serves at most one encore per drop", () => {
    const encores = ["e1", "e2", "e3"];
    const result = buildDrop(
      input({
        now: WEEK_5,
        dropDate: "2026-10-15",
        pool: encores.map((id) => profile(id)),
        seenProfileIds: encores,
        passedHistory: encores.map((profileId) => ({ profileId, week: 1 })),
      }),
    );
    expect(result.cards.filter((c) => c.isEncore)).toHaveLength(1);
  });

  it("fills the rest of the drop with fresh faces around the one encore", () => {
    const result = buildDrop(
      input({
        now: WEEK_5,
        dropDate: "2026-10-15",
        pool: [profile("encore"), profile("fresh1"), profile("fresh2"), profile("fresh3")],
        seenProfileIds: ["encore"],
        passedHistory: [{ profileId: "encore", week: 1 }],
      }),
    );
    expect(result.cards).toHaveLength(3);
    expect(result.cards.filter((c) => c.isEncore).length).toBeLessThanOrEqual(1);
    // Whoever else makes the cut has never been shown before.
    for (const shown of result.cards.filter((c) => !c.isEncore)) {
      expect(shown.profileId).toMatch(/^fresh/);
    }
  });
});

describe("orientation asymmetry", () => {
  it("handles a pool where one side is over-represented", () => {
    // 8 women seeking men, 1 man seeking women. The man sees three of them;
    // each woman sees exactly one candidate.
    const women = Array.from({ length: 8 }, (_, i) =>
      profile(`w${i}`, { gender: "woman", seeking: ["man"], neighborhood: null }),
    );
    const man = profile("m", { gender: "man", seeking: ["woman"], neighborhood: null });

    const hisDrop = buildDrop(input({ viewer: man, pool: [...women, man] }));
    expect(hisDrop.cards).toHaveLength(3);
    expect(hisDrop.eligibleCount).toBe(8);

    const herDrop = buildDrop(
      input({ viewer: women[0] as PoolProfile, pool: [...women, man] }),
    );
    expect(herDrop.cards).toHaveLength(1);
    expect(herDrop.cards[0]?.profileId).toBe("m");
  });

  it("goes quiet rather than crossing orientation lines", () => {
    const menSeekingWomen = Array.from({ length: 5 }, (_, i) =>
      profile(`m${i}`, { gender: "man", seeking: ["woman"] }),
    );
    const viewer = profile("v", { gender: "man", seeking: ["man"] });
    const result = buildDrop(input({ viewer, pool: menSeekingWomen }));
    expect(result.quietNight).toBe(true);
  });
});
