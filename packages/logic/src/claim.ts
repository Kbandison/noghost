import type { ApplicationStatus } from "@noghost/types";
import { addHours, toMs } from "./time";

/**
 * Claim windows and waitlist promotion — spec §4.3 `claim-sweep`, §7.3.
 *
 * An admitted applicant has `season.claim_hours` to buy their pass. Until they
 * do, the seat is *reserved but unpaid*: nobody else can have it and no money
 * has arrived. When the window lapses the seat has to go back into circulation,
 * or a cohort of 300 quietly becomes a cohort of 240 who all paid.
 *
 * Pure, like every other mechanic here. `now` is an argument, the functions
 * decide nothing about *when* they run, and applying the same sweep twice
 * changes nothing — which is what makes the cron safe to re-run.
 */

export interface ClaimApplication {
  id: string;
  userId: string;
  status: ApplicationStatus;
  /** Null for anything that was never admitted. */
  claimDeadline: string | null;
  /** Ordering for the waitlist. Null sorts last. */
  waitlistPosition: number | null;
  createdAt: string;
}

export interface SweepPlan {
  /** Admitted applications whose window has lapsed: admitted → expired. */
  expire: ClaimApplication[];
  /** Waitlisted applications taking the freed seats: waitlisted → admitted. */
  promote: ClaimApplication[];
  /** Admitted-and-still-open applicants who should be nudged. */
  remind: ClaimApplication[];
  /** Seats that remain unfilled after promoting everyone available. */
  seatsLeftOver: number;
}

/** Send one nudge when this much of the window remains. */
export const CLAIM_REMINDER_HOURS_LEFT = 12;

export function isClaimExpired(deadline: string | null, now: string): boolean {
  if (!deadline) return false;
  // Strictly past. A deadline exactly equal to `now` has not lapsed yet — the
  // person could still be mid-checkout, and taking a seat away from someone
  // who paid on the last second is the worst possible failure here.
  return toMs(now) > toMs(deadline);
}

/** True when the window is still open but closing within the reminder horizon. */
export function needsClaimReminder(deadline: string | null, now: string): boolean {
  if (!deadline || isClaimExpired(deadline, now)) return false;
  return toMs(now) >= toMs(addHours(deadline, -CLAIM_REMINDER_HOURS_LEFT));
}

/**
 * Seats a season can still give away.
 *
 * An open claim window counts as occupied. Promoting into a seat that someone
 * else is currently mid-checkout for would oversell the cohort, and the cap is
 * a promise to members about how many people they are choosing among — not a
 * revenue target to round up.
 */
export function seatsAvailable(
  memberCap: number,
  applications: readonly ClaimApplication[],
  now: string,
): number {
  const occupied = applications.filter(
    (a) =>
      a.status === "claimed" ||
      (a.status === "admitted" && !isClaimExpired(a.claimDeadline, now)),
  ).length;

  return Math.max(memberCap - occupied, 0);
}

/**
 * What one run of `claim-sweep` should do.
 *
 * Expiry is computed first and its seats are included in the promotion budget,
 * so a lapsed window is refilled in the same pass rather than sitting empty
 * until the next hour.
 */
export function planClaimSweep(
  applications: readonly ClaimApplication[],
  memberCap: number,
  now: string,
): SweepPlan {
  const expire = applications.filter(
    (a) => a.status === "admitted" && isClaimExpired(a.claimDeadline, now),
  );

  const remind = applications.filter(
    (a) => a.status === "admitted" && needsClaimReminder(a.claimDeadline, now),
  );

  // Seats counted *after* the expiries above are applied.
  const expired = new Set(expire.map((a) => a.id));
  const surviving = applications.filter((a) => !expired.has(a.id));
  const seats = seatsAvailable(memberCap, surviving, now);

  const waiting = applications
    .filter((a) => a.status === "waitlisted")
    // Explicit position first, then by when they applied. Nulls last, so a row
    // with no position never jumps someone who was given one.
    .slice()
    .sort((a, b) => {
      const pa = a.waitlistPosition ?? Number.MAX_SAFE_INTEGER;
      const pb = b.waitlistPosition ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      return toMs(a.createdAt) - toMs(b.createdAt);
    });

  const promote = waiting.slice(0, seats);

  return { expire, promote, remind, seatsLeftOver: seats - promote.length };
}
