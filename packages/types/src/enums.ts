/**
 * Postgres enums — spec §5, mirrored one-for-one.
 *
 * Declared as const arrays so they can be iterated (admin filters, seed data,
 * exhaustiveness tests) as well as used as types. When the generated Supabase
 * types land, `assertEnumsMatchDatabase` in the db package checks these against
 * the real schema so the two can never drift silently.
 */

export const APPLICATION_STATUSES = [
  "applied",
  "phone_verified",
  "selfie_submitted",
  "under_review",
  "admitted",
  "claimed",
  "waitlisted",
  "rejected",
  "expired",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const SEASON_PHASES = [
  "draft",
  "applications_open",
  "pre_season",
  "live",
  "finale_week",
  "closed",
] as const;
export type SeasonPhase = (typeof SEASON_PHASES)[number];

export const MEMBER_STATUSES = [
  "active",
  "paused",
  "found_someone",
  "removed",
  "season_complete",
] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const CARD_ACTIONS = ["pending", "connected", "passed"] as const;
export type CardAction = (typeof CARD_ACTIONS)[number];

export const CONNECT_STATUSES = ["pending", "accepted", "declined", "expired"] as const;
export type ConnectStatus = (typeof CONNECT_STATUSES)[number];

export const CHAT_STATES = [
  "active",
  "date_scheduled",
  "post_date_checkin",
  "closed_fuse",
  "closed_by_user",
  "closed_graduated",
  "closed_season_end",
] as const;
export type ChatState = (typeof CHAT_STATES)[number];

export const MESSAGE_KINDS = ["text", "voice", "system"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const DATE_STATUSES = [
  "proposed",
  "confirmed",
  "declined",
  "completed",
  "cancelled",
] as const;
export type DateStatus = (typeof DATE_STATUSES)[number];

export const CHECKIN_ANSWERS = ["continue", "close", "no_response"] as const;
export type CheckinAnswer = (typeof CHECKIN_ANSWERS)[number];

export const NOTIF_CHANNELS = ["push", "sms", "email", "inapp"] as const;
export type NotifChannel = (typeof NOTIF_CHANNELS)[number];

/** Chat states in which the chat is over. Nothing can be sent to these. */
export const CLOSED_CHAT_STATES = [
  "closed_fuse",
  "closed_by_user",
  "closed_graduated",
  "closed_season_end",
] as const satisfies readonly ChatState[];

/** Chat states that accept new messages — spec §5 `messages` RLS. */
export const OPEN_CHAT_STATES = [
  "active",
  "date_scheduled",
  "post_date_checkin",
] as const satisfies readonly ChatState[];

export function isChatClosed(state: ChatState): boolean {
  return (CLOSED_CHAT_STATES as readonly ChatState[]).includes(state);
}

export function isChatOpen(state: ChatState): boolean {
  return (OPEN_CHAT_STATES as readonly ChatState[]).includes(state);
}
