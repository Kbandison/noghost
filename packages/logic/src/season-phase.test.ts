import { describe, expect, it } from "vitest";
import { announcementsFor, nextPhase, phaseForDate, type SeasonDates } from "./season-phase";

/** An eight-week season: applications open S−70, starts S, ends S+56. */
const season = (over: Partial<SeasonDates> = {}): SeasonDates => ({
  phase: "applications_open",
  applications_open_at: "2026-07-27T04:00:00.000Z",
  starts_at: "2026-10-05T04:00:00.000Z",
  ends_at: "2026-11-30T05:00:00.000Z",
  ...over,
});

const day = (n: number, from = "2026-10-05T04:00:00.000Z") =>
  new Date(Date.parse(from) + n * 86_400_000).toISOString();

describe("where the calendar says a season is", () => {
  it("walks the whole life of a season", () => {
    expect(phaseForDate(season(), "2026-07-01T00:00:00.000Z")).toBe("draft");
    expect(phaseForDate(season(), "2026-08-01T00:00:00.000Z")).toBe("applications_open");
    // S−7: the cohort locks (§11).
    expect(phaseForDate(season(), day(-6))).toBe("pre_season");
    expect(phaseForDate(season(), day(-8))).toBe("applications_open");
    expect(phaseForDate(season(), day(0))).toBe("live");
    expect(phaseForDate(season(), day(30))).toBe("live");
    // The last week is its own phase.
    expect(phaseForDate(season(), day(52))).toBe("finale_week");
    expect(phaseForDate(season(), day(60))).toBe("closed");
  });

  it("calls a season draft only before its applications open", () => {
    // `draft` doubles as "not published" and "not open yet" — the enum has no
    // separate value — and the day it opens is the line between them.
    expect(phaseForDate(season(), "2026-07-26T00:00:00.000Z")).toBe("draft");
    expect(phaseForDate(season(), "2026-07-28T00:00:00.000Z")).toBe("applications_open");
    for (const at of [day(-1), day(10), day(100)]) {
      expect(phaseForDate(season(), at)).not.toBe("draft");
    }
  });

  it("leaves a season with no opening date unscheduled", () => {
    const unscheduled = season({ applications_open_at: null });
    expect(phaseForDate(unscheduled, "2026-08-01T00:00:00.000Z")).toBe("draft");
    // But its own start date still governs once that arrives.
    expect(phaseForDate(unscheduled, day(1))).toBe("live");
  });
});

describe("what the tick is allowed to change", () => {
  it("advances a season that has fallen behind", () => {
    expect(nextPhase(season({ phase: "applications_open" }), day(1))).toBe("live");
  });

  it("does nothing when the season is already where it should be", () => {
    expect(nextPhase(season({ phase: "live" }), day(10))).toBeNull();
  });

  it("never publishes a draft — that is a person's decision", () => {
    // Somebody sketching next season with placeholder dates must not have
    // applications opened for them by a cron at 6am. §7.3 puts phase
    // transitions behind a confirm gate.
    expect(nextPhase(season({ phase: "draft" }), day(1))).toBeNull();
    expect(nextPhase(season({ phase: "draft" }), day(100))).toBeNull();
  });

  it("never moves a season backwards", () => {
    // An admin who closed a season early made a decision. A tick that reopened
    // it the next morning would be overruling a person with a clock.
    expect(nextPhase(season({ phase: "closed" }), day(10))).toBeNull();
    expect(nextPhase(season({ phase: "finale_week" }), day(10))).toBeNull();
  });

  it("is idempotent — applying its own result changes nothing", () => {
    const before = season({ phase: "applications_open" });
    const target = nextPhase(before, day(1));
    expect(target).toBe("live");
    expect(nextPhase({ ...before, phase: target! }, day(1))).toBeNull();
  });
});

describe("what a transition owes the cohort", () => {
  it("announces the start and the final week", () => {
    expect(announcementsFor("pre_season", "live")).toEqual(["season_start"]);
    expect(announcementsFor("live", "finale_week")).toEqual(["season_finale"]);
  });

  it("says nothing on the transitions that are not news", () => {
    expect(announcementsFor("applications_open", "pre_season")).toEqual([]);
    expect(announcementsFor("finale_week", "closed")).toEqual([]);
  });

  it("catches up both messages when a tick was missed", () => {
    // A season that jumped straight to its final week never told anyone it
    // started either. Keying on the phases crossed, not on the pair, is what
    // makes the backlog land instead of vanishing.
    expect(announcementsFor("pre_season", "finale_week")).toEqual([
      "season_start",
      "season_finale",
    ]);
  });

  it("does not re-announce a phase already behind it", () => {
    expect(announcementsFor("live", "closed")).toEqual(["season_finale"]);
  });
});
