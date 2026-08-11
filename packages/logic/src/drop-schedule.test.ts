import { describe, expect, it } from "vitest";
import {
  dropDateFor,
  dropTimeMinutes,
  isReleaseDue,
  isSeasonServing,
  localParts,
} from "./drop-schedule";

const ET = "America/New_York";
const SCHEDULE = { timezone: ET, dropTime: "20:00:00" };

describe("localParts", () => {
  it("reads the season's wall clock, not the server's", () => {
    // 00:30 UTC on 3 August is still 20:30 on 2 August in New York.
    expect(localParts("2026-08-03T00:30:00.000Z", ET)).toEqual({
      date: "2026-08-02",
      hour: 20,
      minute: 30,
    });
  });

  it("reports local midnight as hour 0, never 24", () => {
    expect(localParts("2026-08-02T04:00:00.000Z", ET).hour).toBe(0);
  });

  it("gives UTC back when the season is run in UTC", () => {
    expect(localParts("2026-08-02T20:00:00.000Z", "UTC")).toEqual({
      date: "2026-08-02",
      hour: 20,
      minute: 0,
    });
  });
});

describe("dropDateFor", () => {
  it("keeps the evening's drop on the evening's date", () => {
    // The whole 8pm–midnight window belongs to that day, even though it is
    // already tomorrow in UTC. Getting this wrong splits one night's drop
    // across two drop_date values.
    expect(dropDateFor("2026-08-03T00:00:00.000Z", ET)).toBe("2026-08-02");
    expect(dropDateFor("2026-08-03T03:59:00.000Z", ET)).toBe("2026-08-02");
    expect(dropDateFor("2026-08-03T04:00:00.000Z", ET)).toBe("2026-08-03");
  });
});

describe("dropTimeMinutes", () => {
  it("parses a Postgres time with or without seconds", () => {
    expect(dropTimeMinutes("20:00:00")).toBe(1200);
    expect(dropTimeMinutes("20:00")).toBe(1200);
    expect(dropTimeMinutes("19:30:00")).toBe(1170);
    expect(dropTimeMinutes("00:00:00")).toBe(0);
  });
});

describe("isReleaseDue", () => {
  it("is false a minute early and true on the minute", () => {
    expect(isReleaseDue("2026-08-02T23:59:00.000Z", SCHEDULE)).toBe(false);
    expect(isReleaseDue("2026-08-03T00:00:00.000Z", SCHEDULE)).toBe(true);
  });

  /*
   * The reason this module exists. Both assertions below use the same UTC
   * hour — one in EDT, one in EST — and must disagree, because a cron
   * scheduled at `0 0 * * *` fires at 8pm local in summer and 7pm local in
   * winter. A release job without this check would hand out every winter drop
   * an hour early.
   */
  it("refuses the early winter firing of a fixed UTC schedule", () => {
    expect(isReleaseDue("2026-08-03T00:00:00.000Z", SCHEDULE)).toBe(true); // EDT: 20:00
    expect(isReleaseDue("2026-12-03T00:00:00.000Z", SCHEDULE)).toBe(false); // EST: 19:00
  });

  it("accepts the later firing that is 8pm in winter", () => {
    expect(isReleaseDue("2026-12-03T01:00:00.000Z", SCHEDULE)).toBe(true); // EST: 20:00
  });

  it("stays true for the rest of the evening, so a retry still releases", () => {
    expect(isReleaseDue("2026-08-03T02:30:00.000Z", SCHEDULE)).toBe(true); // EDT: 22:30
  });

  it("is false again after local midnight — that is tomorrow's drop", () => {
    // 04:30 UTC is 00:30 the next day in New York. dropDateFor has already
    // rolled over, so "not due" here is correct rather than a bug.
    expect(isReleaseDue("2026-08-03T04:30:00.000Z", SCHEDULE)).toBe(false);
    expect(dropDateFor("2026-08-03T04:30:00.000Z", SCHEDULE.timezone)).toBe("2026-08-03");
  });

  it("honours a season configured for a different hour", () => {
    const early = { timezone: ET, dropTime: "18:00:00" };
    expect(isReleaseDue("2026-08-02T22:00:00.000Z", early)).toBe(true); // 18:00 EDT
    expect(isReleaseDue("2026-08-02T22:00:00.000Z", SCHEDULE)).toBe(false); // not yet 20:00
  });
});

describe("isSeasonServing", () => {
  const starts = "2026-10-05T04:00:00.000Z";
  const ends = "2026-11-30T05:00:00.000Z";

  it("serves during live and finale week", () => {
    expect(isSeasonServing("live", starts, ends, "2026-10-10T00:00:00.000Z")).toBe(true);
    expect(isSeasonServing("finale_week", starts, ends, "2026-11-25T00:00:00.000Z")).toBe(true);
  });

  it("does not serve before day one, even once seats are sold", () => {
    // Members exist in pre_season and have paid. Serving them a drop built
    // from a half-formed cohort spends first impressions that cannot be
    // spent twice — everyone starts together, or the premise is a lie.
    expect(isSeasonServing("pre_season", starts, ends, "2026-10-01T00:00:00.000Z")).toBe(false);
  });

  it("does not serve in draft, applications_open or closed", () => {
    for (const phase of ["draft", "applications_open", "closed"] as const) {
      expect(isSeasonServing(phase, starts, ends, "2026-10-10T00:00:00.000Z")).toBe(false);
    }
  });

  it("stops at ends_at, and the boundary is exclusive", () => {
    expect(isSeasonServing("live", starts, ends, ends)).toBe(false);
    expect(isSeasonServing("live", starts, ends, "2026-11-30T04:59:59.000Z")).toBe(true);
  });

  it("does not serve before starts_at even when the phase says live", () => {
    // A phase flipped early by hand must not out-rank the calendar.
    expect(isSeasonServing("live", starts, ends, "2026-10-04T00:00:00.000Z")).toBe(false);
    expect(isSeasonServing("live", starts, ends, starts)).toBe(true);
  });
});
