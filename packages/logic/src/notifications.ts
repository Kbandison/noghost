import type { NotifChannel } from "@noghost/types";
import { hoursBetween, isQuietHour } from "./time";

/**
 * What to do with one queued notification — spec §8.
 *
 * The queue has been filling since 0005 with nothing to drain it. This is the
 * decision half of the drain, kept here rather than in the cron route because
 * it is the part with rules in it: quiet hours, member preferences, TCPA, and
 * the one that is easy to miss — that some notifications are worse late than
 * never.
 *
 * Pure, like everything else in this package. "Now" is an argument.
 */

/** What the caller can actually deliver right now. */
export interface Transports {
  push: boolean;
  sms: boolean;
  email: boolean;
  /** Always true: an in-app row is delivered by existing. */
  inapp?: boolean;
}

export interface NotificationPrefs {
  drop_push: boolean;
  drop_sms: boolean;
  fuse_warnings: boolean;
  email_updates: boolean;
  /** TCPA §9.8: a toggle is not consent; the timestamp is. */
  sms_opt_in_at: string | null;
}

export interface QueuedNotification {
  template: string;
  channel: NotifChannel;
  createdAt: string;
}

export type NotificationSkipReason =
  /** True when it was queued, false by the time it could be sent. */
  | "stale"
  /** The member turned this off and it is not one of the required ones. */
  | "declined"
  /** No transport for this channel, and it went stale waiting for one. */
  | "no-transport"
  /** Not in §8's matrix — nothing knows what it is or who it is for. */
  | "unknown-template"
  /**
   * In the matrix, but §9 has no wording for it on this channel. Distinct from
   * `unknown-template` because it is a copy gap, not a bug: the lifecycle
   * templates have email and SMS copy in §9.5 and no push line.
   */
  | "no-copy";

export type DeliveryPlan =
  | { action: "deliver" }
  | { action: "defer"; until: "waking-hours" | "a-transport" }
  | { action: "skip"; reason: NotificationSkipReason };

/**
 * How long a notification stays true.
 *
 * Not one number, because "stale" means different things. A fuse warning names
 * a deadline, so it is wrong the moment the deadline moves; a closure note is
 * about something that happened and is still worth reading tomorrow.
 *
 * `null` means it never goes stale on its own — it will be delivered whenever a
 * transport exists, however long that takes.
 */
export const NOTIFICATION_TTL_HOURS: Record<string, number | null> = {
  // Deadline claims. Late is not late, it is false.
  fuse_48h: 6,
  fuse_24h: 6,
  // "Tonight's drop is live" is about tonight.
  drop_live: 4,
  claim_reminder: 12,
  // Invitations to act, still useful for a while.
  date_proposed: 48,
  checkin_open: 48,
  connect_nudge: 48,
  connect_received: 72,
  connect_accepted: 72,
  date_confirmed: 24,
  // Things that happened. Worth reading whenever they arrive.
  chat_closed_fuse: null,
  closure_received: null,
  connect_declined: null,
  member_warned: null,
  admitted_claim: null,
  application_received: null,
  season_start: null,
  season_finale: null,
};

/**
 * Templates that override a blanket channel preference.
 *
 * These are §8's `required: true` minus the three that have a switch of their
 * own — see `GOVERNED_BY`. What is left is the lifecycle mail somebody cannot
 * opt out of without losing the season they paid for, and the safety messages
 * that are the product's promise rather than an update about it.
 */
const REQUIRED = new Set([
  "admitted_claim",
  "claim_reminder",
  "connect_declined",
  "chat_closed_fuse",
  "closure_received",
  "member_warned",
]);

/**
 * Which preference governs which template. Absent means nothing governs it,
 * which is not the same as "off" — most templates have no switch at all.
 *
 * **The fuse warnings are here, and §8 marks them `required: true`.** That is a
 * deliberate divergence, and the spec contradicts itself on it: the matrix says
 * required, while `notification_prefs`' own comment says the rule is "always
 * keep at least one channel" — which is unsatisfiable for a preference that is
 * a single on/off with no channels to choose between. The settings screen has
 * always shown `fuse_warnings` as a free toggle and refused only the drop.
 *
 * Given the contradiction, this honours the switch the member was shown. A
 * visible control that does nothing is the failure this whole change exists to
 * remove, and turning warnings off does not let anyone be ghosted: the fuse
 * still closes on time and `chat_closed_fuse` and `closure_received` are both
 * above, unswitchable. What they lose is the advance notice, which is the thing
 * they asked to stop receiving.
 */
const GOVERNED_BY: Record<string, keyof NotificationPrefs | undefined> = {
  // `release-drops` already applies these at enqueue time; repeated here so the
  // rule does not depend on which caller happened to queue the row.
  drop_live: "drop_push",
  fuse_48h: "fuse_warnings",
  fuse_24h: "fuse_warnings",
};

/**
 * Decide what happens to one queued row.
 *
 * The order of the checks is the interesting part:
 *
 *   1. unknown template  — before anything reads a rule that does not exist
 *   2. stale             — before quiet hours, so a fuse warning that waited
 *                          out the night is dropped rather than delivered at
 *                          9 AM announcing a deadline that has already passed
 *   3. declined          — a preference is about whether, not when
 *   4. no transport      — defer, because one may exist tomorrow; staleness
 *                          above is what stops that being forever
 *   5. quiet hours       — defer, never skip. §8 says these queue for morning.
 */
export function planNotification(
  row: QueuedNotification,
  prefs: NotificationPrefs | null,
  options: { now: string; timeZone: string; transports: Transports },
): DeliveryPlan {
  const { now, timeZone, transports } = options;

  if (!(row.template in NOTIFICATION_TTL_HOURS)) {
    return { action: "skip", reason: "unknown-template" };
  }

  const ttl = NOTIFICATION_TTL_HOURS[row.template] ?? null;
  const age = hoursBetween(row.createdAt, now);
  const stale = ttl !== null && age > ttl;

  if (stale) {
    // Named for *why* it never went, not for what expired. A row that sat
    // waiting for a transport it never got is a missing provider, not a
    // notification that arrived too late to matter.
    return {
      action: "skip",
      reason: channelAvailable(row.channel, transports) ? "stale" : "no-transport",
    };
  }

  if (!allowedByPrefs(row.template, row.channel, prefs)) {
    return { action: "skip", reason: "declined" };
  }

  if (!channelAvailable(row.channel, transports)) {
    return { action: "defer", until: "a-transport" };
  }

  /*
   * In-app is exempt. Quiet hours exist so nothing wakes anyone up, and a row
   * a member will see next time they open the app wakes nobody — holding it
   * until 9 AM would only mean the app lied about what had happened while
   * they were reading it at midnight.
   */
  if (row.channel !== "inapp" && isQuietHour(now, timeZone)) {
    return { action: "defer", until: "waking-hours" };
  }

  return { action: "deliver" };
}

function channelAvailable(channel: NotifChannel, transports: Transports): boolean {
  if (channel === "inapp") return transports.inapp ?? true;
  return transports[channel] === true;
}

/**
 * Preferences narrow delivery, except where §8 marks a template required.
 *
 * SMS is the exception that is not a preference at all: TCPA (§9.8) makes the
 * recorded opt-in timestamp the consent, so a required template still may not
 * text somebody who never gave one.
 */
function allowedByPrefs(
  template: string,
  channel: NotifChannel,
  prefs: NotificationPrefs | null,
): boolean {
  if (channel === "sms" && !prefs?.sms_opt_in_at) return false;
  if (REQUIRED.has(template)) return true;

  // No row means defaults, and every column default is permissive except SMS.
  if (!prefs) return true;

  if (channel === "email") return prefs.email_updates;

  /*
   * The drop is the one template with a preference per channel, so the lookup
   * has to know which channel it is deciding. Without this, a member who turned
   * push off and opted into SMS would have their text checked against
   * `drop_push` and dropped — the two channels exist precisely so that choice
   * is possible.
   */
  const governing =
    template === "drop_live" && channel === "sms" ? "drop_sms" : GOVERNED_BY[template];

  if (!governing) return true;
  return prefs[governing] === true;
}
