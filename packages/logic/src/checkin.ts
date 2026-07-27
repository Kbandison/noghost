import { CHECKIN_EXPIRE_AFTER_HOURS, CHECKIN_OPEN_AFTER_HOURS } from "@noghost/config";
import type { CheckinAnswer } from "@noghost/types";
import { addHours, hoursBetween } from "./time.js";

/**
 * Post-date check-in — spec §6.3.
 *
 * Privacy rule that shapes the whole design: neither person ever sees the
 * other's raw answer. They see the outcome — the chat continues, or it closes
 * with a note. "They said close" is never surfaced.
 */

export type CheckinOutcome = "pending" | "continue" | "close" | "no_response";

export interface CheckinState {
  answerA: CheckinAnswer;
  answerB: CheckinAnswer;
  openedAt: string;
}

/** The check-in opens 24 hours after the date was scheduled for. */
export function checkinOpensAt(dateScheduledFor: string): string {
  return addHours(dateScheduledFor, CHECKIN_OPEN_AFTER_HOURS);
}

export function checkinExpiresAt(openedAt: string): string {
  return addHours(openedAt, CHECKIN_EXPIRE_AFTER_HOURS);
}

/**
 * Resolves a check-in.
 *
 * Either person choosing `close` closes the chat, even if the other said
 * continue — one person wanting out is enough, and the other is not told which
 * of them it was.
 */
export function resolveCheckin(state: CheckinState, now: string): CheckinOutcome {
  const { answerA, answerB } = state;

  if (answerA === "close" || answerB === "close") return "close";
  if (answerA === "continue" && answerB === "continue") return "continue";

  if (hoursBetween(state.openedAt, now) >= CHECKIN_EXPIRE_AFTER_HOURS) {
    return "no_response";
  }

  return "pending";
}

/** Which participant, if either, chose to close. Used only to attribute the note. */
export function checkinCloser(
  state: CheckinState,
  userA: string,
  userB: string,
): string | null {
  if (state.answerA === "close") return userA;
  if (state.answerB === "close") return userB;
  return null;
}
