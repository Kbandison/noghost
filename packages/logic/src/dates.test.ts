import { describe, expect, it } from "vitest";
import { canConfirmDate, validateDateProposal } from "./dates";
import { addDays, addHours } from "./time";

const NOW = "2026-09-20T18:00:00.000Z";

const valid = {
  scheduledFor: addDays(NOW, 3),
  placeName: "Little Tart",
  placeNote: "the one on Howell Mill",
};

describe("validateDateProposal", () => {
  it("accepts a real time and place", () => {
    expect(validateDateProposal(valid, NOW)).toEqual({ ok: true });
  });

  it("requires a place — a fuse doesn't pause on 'sometime'", () => {
    expect(validateDateProposal({ ...valid, placeName: " " }, NOW)).toMatchObject({
      code: "place_required",
    });
  });

  it("rejects a time less than two hours out", () => {
    expect(
      validateDateProposal({ ...valid, scheduledFor: addHours(NOW, 1) }, NOW),
    ).toMatchObject({ code: "too_soon" });
    expect(
      validateDateProposal({ ...valid, scheduledFor: addHours(NOW, 2) }, NOW),
    ).toEqual({ ok: true });
  });

  it("rejects a date parked beyond the window — the anti-loophole rule", () => {
    expect(
      validateDateProposal({ ...valid, scheduledFor: addDays(NOW, 15) }, NOW),
    ).toMatchObject({ code: "too_far" });
    expect(
      validateDateProposal({ ...valid, scheduledFor: addDays(NOW, 14) }, NOW),
    ).toEqual({ ok: true });
  });

  it("rejects a time in the past", () => {
    expect(
      validateDateProposal({ ...valid, scheduledFor: addDays(NOW, -1) }, NOW),
    ).toMatchObject({ code: "too_soon" });
  });

  it("rejects an unparseable time rather than throwing", () => {
    expect(validateDateProposal({ ...valid, scheduledFor: "next tuesday" }, NOW)).toMatchObject(
      { code: "invalid_time" },
    );
  });

  it("bounds the place name and note", () => {
    expect(
      validateDateProposal({ ...valid, placeName: "x".repeat(121) }, NOW),
    ).toMatchObject({ code: "place_too_long" });
    expect(
      validateDateProposal({ ...valid, placeNote: "x".repeat(201) }, NOW),
    ).toMatchObject({ code: "note_too_long" });
  });
});

describe("canConfirmDate", () => {
  it("stops the proposer confirming their own date", () => {
    expect(canConfirmDate("alice", "alice")).toBe(false);
    expect(canConfirmDate("alice", "bob")).toBe(true);
  });
});
