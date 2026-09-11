import { describe, expect, it } from "vitest";
import {
  RATE_FLOOR,
  concurrency,
  dailyMetrics,
  dayRange,
  metricsToCsv,
  type MetricsInput,
} from "./cohort-metrics";

const empty: MetricsInput = {
  drops: [], cards: [], connects: [], chats: [], dates: [], closures: [],
  graduations: [], activity: [],
};

const D = "2026-10-05";

describe("the day range", () => {
  it("includes both ends, so a quiet day is a zero rather than a gap", () => {
    expect(dayRange("2026-10-05", "2026-10-08")).toEqual([
      "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08",
    ]);
    expect(dayRange(D, D)).toEqual([D]);
  });
});

describe("rates that are not really rates", () => {
  it("refuses to divide by a handful", () => {
    // "100% accept rate" from one connect is noise, and this screen is meant
    // to shape Season Two.
    const [day] = dailyMetrics(
      {
        ...empty,
        cards: [{ day: D, action: "connected" }],
        connects: [{ day: D, status: "accepted", fromUser: "a" }],
      },
      [D],
    );
    expect(day?.connectsSent).toBe(1);
    expect(day?.connectRate).toBeNull();
    expect(day?.acceptRate).toBeNull();
  });

  it("and divides once there is enough to divide by", () => {
    const cards = Array.from({ length: 20 }, (_, i) => ({
      day: D, action: (i < 5 ? "connected" : "passed") as "connected" | "passed",
    }));
    const connects = Array.from({ length: RATE_FLOOR }, (_, i) => ({
      day: D, status: (i < 4 ? "accepted" : "declined") as "accepted" | "declined", fromUser: `u${i}`,
    }));
    const [day] = dailyMetrics({ ...empty, cards, connects }, [D]);
    expect(day?.connectRate).toBeCloseTo(5 / 20);
    expect(day?.acceptRate).toBeCloseTo(4 / RATE_FLOOR);
  });

  it("does not count an unanswered note as a rejection", () => {
    // Otherwise every recent day looks worse than it was, and the number drifts
    // upward for a week after the fact as replies land.
    const connects = [
      ...Array.from({ length: 10 }, (_, i) => ({ day: D, status: "accepted" as const, fromUser: `a${i}` })),
      ...Array.from({ length: 90 }, (_, i) => ({ day: D, status: "pending" as const, fromUser: `p${i}` })),
    ];
    const [day] = dailyMetrics({ ...empty, connects }, [D]);
    expect(day?.acceptRate).toBe(1);
  });
});

describe("what ended a conversation", () => {
  it("separates the fuse from a person choosing to close", () => {
    const [day] = dailyMetrics(
      {
        ...empty,
        closures: [
          { day: D, templateId: "fuse_auto", systemSent: true },
          { day: D, templateId: "fuse_auto", systemSent: true },
          { day: D, templateId: "not_a_fit", systemSent: false },
        ],
        graduations: [
          { day: D, status: "confirmed" },
          { day: D, status: "declined" },
        ],
      },
      [D],
    );
    expect(day?.closedByFuse).toBe(2);
    expect(day?.closedByUser).toBe(1);
    // A declined graduation is not a graduation.
    expect(day?.graduations).toBe(1);
  });
});

describe("chats open on a day", () => {
  it("counts one that opened earlier and has not closed", () => {
    const chats = [
      { openedDay: "2026-10-01", closedDay: null, state: "active" },
      { openedDay: "2026-10-01", closedDay: "2026-10-04", state: "closed_fuse" },
      { openedDay: "2026-10-06", closedDay: null, state: "active" },
    ];
    const [day] = dailyMetrics({ ...empty, chats }, [D]);
    // The second closed the day before; the third had not opened yet.
    expect(day?.chatsOpen).toBe(1);
  });
});

describe("how loaded one member gets", () => {
  it("reports the percentile somebody actually experienced", () => {
    const rows = [1, 1, 2, 2, 3, 3, 4, 5, 8, 9].map((open, i) => ({
      day: D, userId: `u${i}`, open,
    }));
    const c = concurrency(rows);
    // Nearest-rank, not interpolated — p90 is a number a real person had.
    expect(c.p50).toBe(3);
    expect(c.p90).toBe(8);
    expect(c.max).toBe(9);
  });

  it("survives an empty window", () => {
    expect(concurrency([])).toEqual({ p50: 0, p90: 0, max: 0 });
  });
});

describe("the CSV", () => {
  it("writes an unmeasured rate as empty, not as zero", () => {
    // A spreadsheet reading "" skips it; reading 0 averages it into the chart.
    const rows = dailyMetrics({ ...empty, cards: [{ day: D, action: "passed" }] }, [D]);
    const csv = metricsToCsv(rows);
    const [header, line] = csv.split("\n");
    const i = header!.split(",").indexOf("connectRate");
    expect(line!.split(",")[i]).toBe("");
  });

  it("has a header and one line per day", () => {
    const csv = metricsToCsv(dailyMetrics(empty, dayRange("2026-10-05", "2026-10-07")));
    expect(csv.split("\n")).toHaveLength(4);
    expect(csv.split("\n")[0]).toContain("day,dropsServed");
  });
});
