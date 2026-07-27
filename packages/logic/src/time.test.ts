import { describe, expect, it } from "vitest";
import {
  addDays,
  addHours,
  ageOn,
  dateKeyInZone,
  daysBetween,
  hourInZone,
  hoursBetween,
  isQuietHour,
  seasonWeek,
} from "./time";

describe("arithmetic", () => {
  it("adds hours and days", () => {
    expect(addHours("2026-09-14T20:00:00.000Z", 4)).toBe("2026-09-15T00:00:00.000Z");
    expect(addDays("2026-09-14T20:00:00.000Z", 7)).toBe("2026-09-21T20:00:00.000Z");
  });

  it("measures gaps in both directions", () => {
    expect(hoursBetween("2026-09-14T00:00:00Z", "2026-09-14T12:00:00Z")).toBe(12);
    expect(hoursBetween("2026-09-14T12:00:00Z", "2026-09-14T00:00:00Z")).toBe(-12);
    expect(daysBetween("2026-09-14T00:00:00Z", "2026-09-21T00:00:00Z")).toBe(7);
  });

  it("throws on an unparseable timestamp rather than producing NaN", () => {
    expect(() => addHours("whenever", 1)).toThrow(/Invalid timestamp/);
  });
});

describe("seasonWeek", () => {
  const start = "2026-09-14T00:00:00.000Z";

  it("counts day one as week one", () => {
    expect(seasonWeek(start, start)).toBe(1);
    expect(seasonWeek(start, addDays(start, 6))).toBe(1);
    expect(seasonWeek(start, addDays(start, 7))).toBe(2);
  });

  it("reaches week 8 on the final stretch and 0 before the season", () => {
    expect(seasonWeek(start, addDays(start, 55))).toBe(8);
    expect(seasonWeek(start, addDays(start, -1))).toBe(0);
  });
});

describe("ageOn", () => {
  it("does not count a birthday that hasn't happened yet", () => {
    expect(ageOn("1996-06-15", "2026-06-14T12:00:00Z")).toBe(29);
    expect(ageOn("1996-06-15", "2026-06-15T00:00:00Z")).toBe(30);
  });

  it("handles a leap-day birthdate", () => {
    expect(ageOn("2004-02-29", "2026-02-28T00:00:00Z")).toBe(21);
    expect(ageOn("2004-02-29", "2026-03-01T00:00:00Z")).toBe(22);
  });
});

describe("timezone helpers", () => {
  const tz = "America/New_York";

  it("resolves the drop date in the season's timezone, not UTC", () => {
    // 8pm ET on the 14th is already the 15th in UTC.
    expect(dateKeyInZone("2026-09-15T00:30:00.000Z", tz)).toBe("2026-09-14");
    expect(hourInZone("2026-09-15T00:30:00.000Z", tz)).toBe(20);
  });

  it("marks 11pm-9am local as quiet", () => {
    expect(isQuietHour("2026-09-15T04:00:00.000Z", tz)).toBe(true); // midnight ET
    expect(isQuietHour("2026-09-15T00:30:00.000Z", tz)).toBe(false); // 8:30pm ET
    expect(isQuietHour("2026-09-15T14:00:00.000Z", tz)).toBe(false); // 10am ET
    expect(isQuietHour("2026-09-15T11:00:00.000Z", tz)).toBe(true); // 7am ET
  });
});
