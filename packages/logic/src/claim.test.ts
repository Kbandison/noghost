import { describe, expect, it } from "vitest";
import {
  CLAIM_REMINDER_HOURS_LEFT,
  isClaimExpired,
  needsClaimReminder,
  planClaimSweep,
  seatsAvailable,
  type ClaimApplication,
} from "./claim";
import { addHours } from "./time";

const NOW = "2026-10-01T12:00:00.000Z";

function app(over: Partial<ClaimApplication> & { id: string }): ClaimApplication {
  return {
    userId: `u-${over.id}`,
    status: "admitted",
    claimDeadline: null,
    waitlistPosition: null,
    createdAt: NOW,
    ...over,
  };
}

describe("isClaimExpired", () => {
  it("is false before the deadline", () => {
    expect(isClaimExpired(addHours(NOW, 1), NOW)).toBe(false);
  });

  it("is true after it", () => {
    expect(isClaimExpired(addHours(NOW, -1), NOW)).toBe(true);
  });

  it("is false exactly on it — someone could be mid-checkout", () => {
    expect(isClaimExpired(NOW, NOW)).toBe(false);
  });

  it("is false when there is no deadline at all", () => {
    expect(isClaimExpired(null, NOW)).toBe(false);
  });
});

describe("needsClaimReminder", () => {
  it("fires inside the reminder horizon", () => {
    const deadline = addHours(NOW, CLAIM_REMINDER_HOURS_LEFT - 1);
    expect(needsClaimReminder(deadline, NOW)).toBe(true);
  });

  it("does not fire while there is plenty of time", () => {
    const deadline = addHours(NOW, CLAIM_REMINDER_HOURS_LEFT + 1);
    expect(needsClaimReminder(deadline, NOW)).toBe(false);
  });

  it("does not fire once the window has already lapsed", () => {
    // An expired window gets the seat taken back, not a nudge to pay.
    expect(needsClaimReminder(addHours(NOW, -1), NOW)).toBe(false);
  });
});

describe("seatsAvailable", () => {
  it("counts paid members as occupied", () => {
    const apps = [app({ id: "a", status: "claimed" }), app({ id: "b", status: "claimed" })];
    expect(seatsAvailable(10, apps, NOW)).toBe(8);
  });

  it("counts an open claim window as occupied", () => {
    const apps = [app({ id: "a", status: "admitted", claimDeadline: addHours(NOW, 5) })];
    expect(seatsAvailable(10, apps, NOW)).toBe(9);
  });

  it("does not count a lapsed window as occupied", () => {
    const apps = [app({ id: "a", status: "admitted", claimDeadline: addHours(NOW, -5) })];
    expect(seatsAvailable(10, apps, NOW)).toBe(10);
  });

  it("ignores applications that were never admitted", () => {
    const apps = [
      app({ id: "a", status: "under_review" }),
      app({ id: "b", status: "rejected" }),
      app({ id: "c", status: "waitlisted" }),
    ];
    expect(seatsAvailable(10, apps, NOW)).toBe(10);
  });

  it("never goes negative when a cohort is over cap", () => {
    const apps = Array.from({ length: 12 }, (_, i) => app({ id: `a${i}`, status: "claimed" }));
    expect(seatsAvailable(10, apps, NOW)).toBe(0);
  });
});

describe("planClaimSweep", () => {
  it("expires a lapsed window and refills the seat in the same pass", () => {
    const apps = [
      app({ id: "lapsed", status: "admitted", claimDeadline: addHours(NOW, -1) }),
      app({ id: "waiting", status: "waitlisted", waitlistPosition: 1 }),
    ];

    const plan = planClaimSweep(apps, 1, NOW);

    expect(plan.expire.map((a) => a.id)).toEqual(["lapsed"]);
    // The freed seat is used now, not an hour from now.
    expect(plan.promote.map((a) => a.id)).toEqual(["waiting"]);
    expect(plan.seatsLeftOver).toBe(0);
  });

  it("does not promote into a seat someone is still mid-checkout for", () => {
    const apps = [
      app({ id: "open", status: "admitted", claimDeadline: addHours(NOW, 5) }),
      app({ id: "waiting", status: "waitlisted", waitlistPosition: 1 }),
    ];

    const plan = planClaimSweep(apps, 1, NOW);

    expect(plan.expire).toEqual([]);
    expect(plan.promote).toEqual([]);
  });

  it("promotes in waitlist-position order", () => {
    const apps = [
      app({ id: "third", status: "waitlisted", waitlistPosition: 3 }),
      app({ id: "first", status: "waitlisted", waitlistPosition: 1 }),
      app({ id: "second", status: "waitlisted", waitlistPosition: 2 }),
    ];

    const plan = planClaimSweep(apps, 2, NOW);
    expect(plan.promote.map((a) => a.id)).toEqual(["first", "second"]);
  });

  it("breaks ties on application time, and never lets an unpositioned row jump one", () => {
    const apps = [
      app({ id: "no-position", status: "waitlisted", createdAt: "2026-01-01T00:00:00.000Z" }),
      app({ id: "positioned", status: "waitlisted", waitlistPosition: 9 }),
    ];

    const plan = planClaimSweep(apps, 1, NOW);
    // Applied far earlier, but an explicit position outranks it.
    expect(plan.promote.map((a) => a.id)).toEqual(["positioned"]);
  });

  it("reports leftover seats when the waitlist runs dry", () => {
    const plan = planClaimSweep([app({ id: "a", status: "waitlisted" })], 5, NOW);
    expect(plan.promote).toHaveLength(1);
    expect(plan.seatsLeftOver).toBe(4);
  });

  it("is idempotent — re-running against the swept state does nothing", () => {
    const apps = [
      app({ id: "lapsed", status: "admitted", claimDeadline: addHours(NOW, -1) }),
      app({ id: "waiting", status: "waitlisted", waitlistPosition: 1 }),
    ];

    const first = planClaimSweep(apps, 1, NOW);

    // Apply the plan, exactly as the cron would.
    const after: ClaimApplication[] = apps.map((a) => {
      if (first.expire.some((e) => e.id === a.id)) return { ...a, status: "expired" as const };
      if (first.promote.some((p) => p.id === a.id)) {
        return { ...a, status: "admitted" as const, claimDeadline: addHours(NOW, 72) };
      }
      return a;
    });

    const second = planClaimSweep(after, 1, NOW);
    expect(second.expire).toEqual([]);
    expect(second.promote).toEqual([]);
  });

  it("nudges an applicant close to their deadline without expiring them", () => {
    const apps = [
      app({ id: "soon", status: "admitted", claimDeadline: addHours(NOW, 2) }),
      app({ id: "plenty", status: "admitted", claimDeadline: addHours(NOW, 48) }),
    ];

    const plan = planClaimSweep(apps, 10, NOW);
    expect(plan.remind.map((a) => a.id)).toEqual(["soon"]);
    expect(plan.expire).toEqual([]);
  });

  it("never promotes past the cap even with a long waitlist", () => {
    const apps = [
      app({ id: "paid", status: "claimed" }),
      ...Array.from({ length: 20 }, (_, i) =>
        app({ id: `w${i}`, status: "waitlisted", waitlistPosition: i }),
      ),
    ];

    const plan = planClaimSweep(apps, 3, NOW);
    expect(plan.promote).toHaveLength(2); // cap 3, one already paid
  });
});
