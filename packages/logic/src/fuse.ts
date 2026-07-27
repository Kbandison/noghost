import {
  FUSE_RESUME_FLOOR_HOURS,
  CHECKIN_EXPIRE_AFTER_HOURS,
} from "@noghost/config";
import type { ChatState } from "@noghost/types";
import { isChatClosed } from "@noghost/types";
import { addDays, addHours, hoursBetween, isAtOrAfter, toMs } from "./time.js";

/**
 * The fuse state machine — spec §6.3.
 *
 * This is the product. Every path out of an open chat writes a closure note;
 * there is no transition to a closed state that does not produce one. That
 * invariant is asserted directly in the tests, and it is what "nobody can be
 * ghosted" means mechanically rather than aspirationally.
 *
 * Pure and idempotent: applying the same event twice is a no-op, because the
 * hourly `fuse-sweep` cron (§4.3) must be safe to re-run.
 */

export interface FuseChat {
  id: string;
  state: ChatState;
  userA: string;
  userB: string;
  fuseExpiresAt: string;
  fusePausedAt: string | null;
  warned48h: boolean;
  warned24h: boolean;
  closedAt: string | null;
  /**
   * When the post-date check-in opened (the confirmed date's `scheduled_for`
   * + 24h). Derived by the caller from the `dates` row rather than stored, so
   * the schema stays exactly as specced in §5.
   */
  checkinOpenedAt?: string | null;
}

export interface FuseConfig {
  fuseDays: number;
  seasonEndsAt: string;
}

export type FuseEvent =
  /** The hourly sweep. Drives warnings, expiry, and check-in timeouts. */
  | { type: "tick"; at: string }
  /** Both sides agreed on a real time and place. The only thing that pauses a fuse. */
  | { type: "date_confirmed"; at: string; scheduledFor: string }
  | { type: "date_cancelled"; at: string }
  /** The confirmed date's time + 24h has passed; the check-in opens. */
  | { type: "date_elapsed"; at: string }
  | {
      type: "checkin_resolved";
      at: string;
      outcome: "continue" | "close" | "no_response";
      /** Who chose to close, when the outcome is `close`. Never revealed to the partner. */
      closedBy?: string;
      templateId?: string;
    }
  | {
      type: "user_close";
      at: string;
      by: string;
      templateId: string;
      personalLine?: string;
    }
  | { type: "graduated"; at: string; byUser: string }
  | { type: "member_removed"; at: string; removedUserId: string }
  | { type: "season_ended"; at: string };

/**
 * Side effects the caller must apply. Returned rather than performed so this
 * stays pure — the RPC or cron wrapper writes them inside the same transaction
 * that commits the state change.
 */
export type FuseEffect =
  | { kind: "notify"; template: string; toUsers: string[] }
  | {
      kind: "closure_note";
      templateId: string;
      /** Null means the system closed it, not a person (spec §5 `closure_notes.from_user`). */
      fromUser: string | null;
      personalLine?: string;
      toUsers: string[];
    };

export interface FuseTransition {
  chat: FuseChat;
  effects: FuseEffect[];
  changed: boolean;
}

function unchanged(chat: FuseChat): FuseTransition {
  return { chat, effects: [], changed: false };
}

function participants(chat: FuseChat): string[] {
  return [chat.userA, chat.userB];
}

function partnerOf(chat: FuseChat, user: string): string {
  return chat.userA === user ? chat.userB : chat.userA;
}

/**
 * Fuse time banked while a date is on the calendar. Measured from the moment
 * the fuse paused, which is what a cancellation later restores.
 */
export function remainingFuseHours(chat: FuseChat, now: string): number {
  const from = chat.fusePausedAt ?? now;
  return Math.max(0, hoursBetween(from, chat.fuseExpiresAt));
}

interface ClosureSpec {
  templateId: string;
  fromUser: string | null;
  personalLine?: string;
  /** Defaults to both participants. Removal notes go to the partner only. */
  toUsers?: string[];
}

function close(
  chat: FuseChat,
  at: string,
  state: ChatState,
  note: ClosureSpec,
  notify?: { template: string; toUsers: string[] },
): FuseTransition {
  const effects: FuseEffect[] = [
    {
      kind: "closure_note",
      templateId: note.templateId,
      fromUser: note.fromUser,
      ...(note.personalLine !== undefined ? { personalLine: note.personalLine } : {}),
      toUsers: note.toUsers ?? participants(chat),
    },
  ];
  if (notify) effects.push({ kind: "notify", template: notify.template, toUsers: notify.toUsers });

  return {
    chat: { ...chat, state, closedAt: at },
    effects,
    changed: true,
  };
}

/**
 * Applies one event to one chat.
 *
 * Season end is checked before everything else: `ends_at` closes every open
 * chat regardless of what else was about to happen to it (spec §6.3,
 * "any state ──(season ends_at)──► closed_season_end").
 */
export function fuseTransition(
  chat: FuseChat,
  event: FuseEvent,
  config: FuseConfig,
): FuseTransition {
  // Idempotency: a closed chat absorbs every event. Crons re-run; this is why
  // re-running them is safe.
  if (isChatClosed(chat.state)) return unchanged(chat);

  if (event.type === "season_ended" || isAtOrAfter(event.at, config.seasonEndsAt)) {
    return close(chat, event.at, "closed_season_end", {
      templateId: "season_end",
      fromUser: null,
    });
  }

  switch (event.type) {
    case "user_close":
      return close(
        chat,
        event.at,
        "closed_by_user",
        {
          templateId: event.templateId,
          fromUser: event.by,
          ...(event.personalLine !== undefined ? { personalLine: event.personalLine } : {}),
        },
        { template: "closure_received", toUsers: [partnerOf(chat, event.by)] },
      );

    case "graduated":
      return close(chat, event.at, "closed_graduated", {
        templateId: "closure_03",
        fromUser: event.byUser,
      });

    case "member_removed":
      // Even removal doesn't ghost anyone (spec §7.3). The partner gets a
      // neutral system note; the removed member gets nothing.
      return close(chat, event.at, "closed_by_user", {
        templateId: "removal",
        fromUser: null,
        toUsers: [partnerOf(chat, event.removedUserId)],
      });

    case "date_confirmed": {
      if (chat.state !== "active") return unchanged(chat);
      return {
        chat: { ...chat, state: "date_scheduled", fusePausedAt: event.at },
        effects: [{ kind: "notify", template: "date_confirmed", toUsers: participants(chat) }],
        changed: true,
      };
    }

    case "date_cancelled": {
      if (chat.state !== "date_scheduled") return unchanged(chat);
      // A cancellation never insta-kills a chat: the fuse resumes with
      // whatever was banked, floored at 48 hours (spec §6.3).
      const banked = chat.fusePausedAt ? hoursBetween(chat.fusePausedAt, chat.fuseExpiresAt) : 0;
      const resumeHours = Math.max(banked, FUSE_RESUME_FLOOR_HOURS);
      const fuseExpiresAt = addHours(event.at, resumeHours);
      return {
        chat: {
          ...chat,
          state: "active",
          fusePausedAt: null,
          fuseExpiresAt,
          // Let the coach speak again for any window the new expiry reopens.
          warned48h: chat.warned48h && resumeHours <= 48,
          warned24h: chat.warned24h && resumeHours <= 24,
        },
        effects: [],
        changed: true,
      };
    }

    case "date_elapsed": {
      if (chat.state !== "date_scheduled") return unchanged(chat);
      return {
        chat: { ...chat, state: "post_date_checkin", checkinOpenedAt: event.at },
        effects: [{ kind: "notify", template: "checkin_open", toUsers: participants(chat) }],
        changed: true,
      };
    }

    case "checkin_resolved": {
      if (chat.state !== "post_date_checkin") return unchanged(chat);

      if (event.outcome === "continue") {
        // A fresh seven days toward date #2 (spec §6.3).
        return {
          chat: {
            ...chat,
            state: "active",
            fusePausedAt: null,
            checkinOpenedAt: null,
            fuseExpiresAt: addDays(event.at, config.fuseDays),
            warned48h: false,
            warned24h: false,
          },
          effects: [],
          changed: true,
        };
      }

      if (event.outcome === "close") {
        const by = event.closedBy ?? null;
        return close(
          chat,
          event.at,
          "closed_by_user",
          {
            // The raw check-in answers are never revealed — the partner sees a
            // closure note, not "they said close" (spec §5 `date_checkins` RLS).
            templateId: event.templateId ?? "closure_02",
            fromUser: by,
          },
          by
            ? { template: "closure_received", toUsers: [partnerOf(chat, by)] }
            : { template: "chat_closed_fuse", toUsers: participants(chat) },
        );
      }

      // no_response
      return close(
        chat,
        event.at,
        "closed_fuse",
        { templateId: "fuse_auto", fromUser: null },
        { template: "chat_closed_fuse", toUsers: participants(chat) },
      );
    }

    case "tick":
      return tick(chat, event.at, config);
  }
}

/** The hourly sweep: warnings, fuse expiry, and check-in timeout. */
function tick(chat: FuseChat, at: string, config: FuseConfig): FuseTransition {
  if (chat.state === "post_date_checkin") {
    const openedAt = chat.checkinOpenedAt;
    if (openedAt && hoursBetween(openedAt, at) >= CHECKIN_EXPIRE_AFTER_HOURS) {
      return close(
        chat,
        at,
        "closed_fuse",
        { templateId: "fuse_auto", fromUser: null },
        { template: "chat_closed_fuse", toUsers: participants(chat) },
      );
    }
    return unchanged(chat);
  }

  // The fuse is paused while a date is on the calendar. Nothing to sweep.
  if (chat.state !== "active") return unchanged(chat);

  if (toMs(at) >= toMs(chat.fuseExpiresAt)) {
    return close(
      chat,
      at,
      "closed_fuse",
      { templateId: "fuse_auto", fromUser: null },
      { template: "chat_closed_fuse", toUsers: participants(chat) },
    );
  }

  const hoursLeft = hoursBetween(at, chat.fuseExpiresAt);

  // 24h wins if both windows are open — one warning per sweep, and the more
  // urgent one is the honest one to send.
  if (hoursLeft <= 24 && !chat.warned24h) {
    return {
      chat: { ...chat, warned24h: true, warned48h: true },
      effects: [{ kind: "notify", template: "fuse_24h", toUsers: participants(chat) }],
      changed: true,
    };
  }

  if (hoursLeft <= 48 && !chat.warned48h) {
    return {
      chat: { ...chat, warned48h: true },
      effects: [{ kind: "notify", template: "fuse_48h", toUsers: participants(chat) }],
      changed: true,
    };
  }

  return unchanged(chat);
}

/**
 * Fuse urgency for the chat list ring — spec §7.2.
 * Calm above 72h, amber under 48h, warm-red under 24h. Never a panic timer.
 */
export type FuseUrgency = "paused" | "calm" | "amber" | "urgent" | "closed";

export function fuseUrgency(chat: FuseChat, now: string): FuseUrgency {
  if (isChatClosed(chat.state)) return "closed";
  if (chat.state !== "active") return "paused";
  const hoursLeft = hoursBetween(now, chat.fuseExpiresAt);
  if (hoursLeft <= 24) return "urgent";
  if (hoursLeft <= 48) return "amber";
  return "calm";
}

/** A new chat's fuse starts the moment the connect is accepted (spec §6.2). */
export function openingFuseExpiry(acceptedAt: string, fuseDays: number): string {
  return addDays(acceptedAt, fuseDays);
}
