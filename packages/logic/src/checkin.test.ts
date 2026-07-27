import { describe, expect, it } from "vitest";
import { checkinCloser, checkinExpiresAt, checkinOpensAt, resolveCheckin } from "./checkin";
import { addHours } from "./time";

const OPENED = "2026-09-22T02:00:00.000Z";

describe("resolveCheckin", () => {
  const state = (answerA: string, answerB: string) =>
    ({ answerA, answerB, openedAt: OPENED }) as Parameters<typeof resolveCheckin>[0];

  it("continues only when both say continue", () => {
    expect(resolveCheckin(state("continue", "continue"), OPENED)).toBe("continue");
  });

  it("closes when either says close, whatever the other said", () => {
    expect(resolveCheckin(state("close", "continue"), OPENED)).toBe("close");
    expect(resolveCheckin(state("continue", "close"), OPENED)).toBe("close");
    expect(resolveCheckin(state("close", "no_response"), OPENED)).toBe("close");
  });

  it("waits while one side is still deciding", () => {
    expect(resolveCheckin(state("continue", "no_response"), addHours(OPENED, 10))).toBe(
      "pending",
    );
  });

  it("times out at 72 hours", () => {
    const half = state("continue", "no_response");
    expect(resolveCheckin(half, addHours(OPENED, 71))).toBe("pending");
    expect(resolveCheckin(half, addHours(OPENED, 72))).toBe("no_response");
  });

  it("still honours an explicit answer past the deadline", () => {
    expect(resolveCheckin(state("close", "continue"), addHours(OPENED, 200))).toBe("close");
  });
});

describe("checkinCloser", () => {
  it("attributes the close so the note can carry a sender", () => {
    const base = { openedAt: OPENED } as const;
    expect(
      checkinCloser({ ...base, answerA: "close", answerB: "continue" }, "alice", "bob"),
    ).toBe("alice");
    expect(
      checkinCloser({ ...base, answerA: "continue", answerB: "close" }, "alice", "bob"),
    ).toBe("bob");
    expect(
      checkinCloser({ ...base, answerA: "continue", answerB: "continue" }, "alice", "bob"),
    ).toBeNull();
  });
});

describe("windows", () => {
  it("opens 24 hours after the date and runs for 72", () => {
    const dateAt = "2026-09-21T02:00:00.000Z";
    expect(checkinOpensAt(dateAt)).toBe(addHours(dateAt, 24));
    expect(checkinExpiresAt(OPENED)).toBe(addHours(OPENED, 72));
  });
});
