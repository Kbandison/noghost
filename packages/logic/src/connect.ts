import { CONNECT_NUDGE_HOURS } from "@noghost/config";
import type { CardAction, ConnectStatus, PromptRef } from "@noghost/types";
import { hoursBetween } from "./time";
import { openingFuseExpiry } from "./fuse";

/**
 * The connect flow — spec §6.2, the inbox model.
 *
 * The rule that makes it work: there is no like button. To say hello you have
 * to reply to something specific, and the recipient answers either way. A pass
 * is silent and final; a decline is kind and final. Nothing ends in nothing.
 */

export interface ConnectDraft {
  fromUser: string;
  toUser: string;
  dropCardId: string;
  promptRef: PromptRef;
  replyText?: string | null;
  replyVoicePath?: string | null;
}

export interface ConnectCardContext {
  /** The card's owner. Must be the sender — you can only connect from your own drop. */
  ownerId: string;
  shownProfileId: string;
  action: CardAction;
  /** Whether the drop has actually been released. Nothing acts on an unreleased drop. */
  released: boolean;
}

export type ValidationResult = { ok: true } | { ok: false; code: string; message: string };

const MIN_REPLY_LENGTH = 2;
const MAX_REPLY_LENGTH = 1000;

/**
 * Everything `send_connect()` must check before it writes. Mirrored exactly in
 * the RPC so the database enforces it too — the client is never the guard
 * (spec §5, "clients never mutate state columns").
 */
export function validateConnect(
  draft: ConnectDraft,
  card: ConnectCardContext,
  existingConnectStatus: ConnectStatus | null,
): ValidationResult {
  if (!card.released) {
    return { ok: false, code: "drop_not_released", message: "That drop hasn't landed yet." };
  }
  if (card.ownerId !== draft.fromUser) {
    return { ok: false, code: "not_your_card", message: "That card isn't yours." };
  }
  if (card.shownProfileId !== draft.toUser) {
    return { ok: false, code: "card_mismatch", message: "That card is for someone else." };
  }
  if (card.action !== "pending") {
    return {
      ok: false,
      code: "card_already_acted",
      message: "You've already answered this card.",
    };
  }
  // One shot per pair per season, in any status. A decline is final (spec §6.2).
  if (existingConnectStatus !== null) {
    return {
      ok: false,
      code: "connect_exists",
      message: "You've already had your one connect with this person this season.",
    };
  }

  const text = draft.replyText?.trim() ?? "";
  const hasVoice = Boolean(draft.replyVoicePath);
  if (!text && !hasVoice) {
    return {
      ok: false,
      code: "reply_required",
      message: "Reply to something specific. It's the only way to say hello here.",
    };
  }
  if (text && text.length < MIN_REPLY_LENGTH) {
    return { ok: false, code: "reply_too_short", message: "That's not quite a reply yet." };
  }
  if (text.length > MAX_REPLY_LENGTH) {
    return { ok: false, code: "reply_too_long", message: "Keep it under 1000 characters." };
  }

  return { ok: true };
}

export type ConnectResponse = "accept" | "decline";

export interface ConnectOutcome {
  status: ConnectStatus;
  /** Present on accept — the chat to create, with its fuse already ticking. */
  chat?: { fuseExpiresAt: string };
  effects: ConnectEffect[];
}

export type ConnectEffect =
  | { kind: "notify"; template: string; toUsers: string[] }
  | {
      kind: "system_message";
      templateId: string;
      toUser: string;
    }
  /** The connect's reply becomes message #1 of the new chat (spec §6.2). */
  | { kind: "seed_first_message"; fromUser: string };

/**
 * Resolves an inbox decision.
 *
 * A decline is not silence and is not a soft "maybe later" — the sender gets
 * `decline_auto` immediately, with no reply channel.
 */
export function respondToConnect(
  response: ConnectResponse,
  ctx: { fromUser: string; toUser: string; at: string; fuseDays: number },
): ConnectOutcome {
  if (response === "accept") {
    return {
      status: "accepted",
      chat: { fuseExpiresAt: openingFuseExpiry(ctx.at, ctx.fuseDays) },
      effects: [
        { kind: "seed_first_message", fromUser: ctx.fromUser },
        { kind: "notify", template: "connect_accepted", toUsers: [ctx.fromUser] },
      ],
    };
  }

  return {
    status: "declined",
    effects: [
      { kind: "system_message", templateId: "decline_auto", toUser: ctx.fromUser },
      { kind: "notify", template: "connect_declined", toUsers: [ctx.fromUser] },
    ],
  };
}

/**
 * A season ending with the connect still pending is still an answer — the
 * sender gets the decline note rather than nothing (spec §6.2).
 */
export function expireConnect(fromUser: string): ConnectOutcome {
  return {
    status: "expired",
    effects: [{ kind: "system_message", templateId: "decline_auto", toUser: fromUser }],
  };
}

/**
 * Whether a pending connect has earned its single nudge. The nudge goes to the
 * recipient only — the sender is never told their note is sitting unread,
 * because that would be pressure, not information (spec §6.2).
 */
export function needsNudge(
  connect: { status: ConnectStatus; createdAt: string; nudgedAt?: string | null },
  now: string,
): boolean {
  if (connect.status !== "pending") return false;
  if (connect.nudgedAt) return false;
  return hoursBetween(connect.createdAt, now) >= CONNECT_NUDGE_HOURS;
}
