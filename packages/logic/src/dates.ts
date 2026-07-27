import { DATE_MAX_LEAD_DAYS, DATE_MIN_LEAD_HOURS } from "@noghost/config";
import { daysBetween, hoursBetween } from "./time.js";

/**
 * Date proposals — spec §6.3, "What counts as a date".
 *
 * A confirmed date is the only thing that pauses a fuse, which makes this the
 * spot where someone would game the mechanic. The window closes the loophole:
 * a date must be far enough out to be real and near enough to be a plan, so
 * "coffee sometime next year" can't freeze a chat indefinitely.
 */

export interface DateProposalInput {
  scheduledFor: string;
  placeName: string;
  placeNote?: string | null;
}

export type DateValidation = { ok: true } | { ok: false; code: string; message: string };

const PLACE_MIN = 2;
const PLACE_MAX = 120;
const NOTE_MAX = 200;

export function validateDateProposal(
  input: DateProposalInput,
  now: string,
): DateValidation {
  const place = input.placeName.trim();
  if (place.length < PLACE_MIN) {
    return { ok: false, code: "place_required", message: "Where are you meeting?" };
  }
  if (place.length > PLACE_MAX) {
    return { ok: false, code: "place_too_long", message: "Keep the place name short." };
  }
  if ((input.placeNote?.length ?? 0) > NOTE_MAX) {
    return { ok: false, code: "note_too_long", message: "Keep the note short." };
  }

  let leadHours: number;
  try {
    leadHours = hoursBetween(now, input.scheduledFor);
  } catch {
    return { ok: false, code: "invalid_time", message: "That's not a real time." };
  }

  if (leadHours < DATE_MIN_LEAD_HOURS) {
    return {
      ok: false,
      code: "too_soon",
      message: `Pick a time at least ${DATE_MIN_LEAD_HOURS} hours from now.`,
    };
  }
  if (daysBetween(now, input.scheduledFor) > DATE_MAX_LEAD_DAYS) {
    return {
      ok: false,
      code: "too_far",
      message: `Pick a time within the next ${DATE_MAX_LEAD_DAYS} days.`,
    };
  }

  return { ok: true };
}

/**
 * Only the person who did NOT propose can confirm. Self-confirming would let
 * one member pause a fuse unilaterally, which is the whole loophole.
 */
export function canConfirmDate(proposedBy: string, confirmingUser: string): boolean {
  return proposedBy !== confirmingUser;
}
