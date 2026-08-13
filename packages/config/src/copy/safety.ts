/**
 * Reporting — spec §7.2, and the Community Standards page's four promises:
 *
 *   "Report from any profile or chat."
 *   "Reporting immediately removes you and that person from each other's
 *    drops, before anyone reviews it."
 *   "The person you report is never told who reported them."
 *   "If we remove someone, their open chats close with a neutral system note to
 *    their partners. Even removal doesn't ghost anyone."
 *
 * Those are published commitments, not UI suggestions, so the copy below says
 * the same things in the same order — a member reading the standards page and
 * a member in the middle of reporting should not learn different rules.
 */

/**
 * The reasons, taken from the standards page's "Never" list rather than
 * invented here, plus one open option.
 *
 * `id` is what lands in `reports.reason` and is what moderation will group by,
 * so these strings are stable: changing a label is free, changing an id
 * silently splits a category in two.
 *
 * Deliberately short. A long taxonomy makes somebody who has just been
 * frightened do classification work, and the detail box is where the real
 * information goes anyway.
 */
export const REPORT_REASONS = [
  {
    id: "harassment",
    label: "Harassment or threats",
    hint: "Anything aggressive, intimidating, or that made you feel unsafe.",
  },
  {
    id: "hate",
    label: "Slurs or hate",
    hint: "Attacks on who someone is.",
  },
  {
    id: "explicit",
    label: "Unsolicited explicit images",
    hint: "Anything sexual you didn't ask for.",
  },
  {
    id: "money",
    label: "Asking for money or selling something",
    hint: "Requests for money, crypto, gift cards, or promoting a business.",
  },
  {
    id: "fake",
    label: "Not who they say they are",
    hint: "The photos, the age, or the person don't match.",
  },
  {
    id: "underage",
    label: "Under 21",
    hint: "This season is 21+, and we act on this one immediately.",
  },
  {
    id: "other",
    label: "Something else",
    hint: "Tell us in your own words below.",
  },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportReasonId = ReportReason["id"];

const REASON_IDS: readonly string[] = REPORT_REASONS.map((reason) => reason.id);
export const isReportReasonId = (value: string): value is ReportReasonId =>
  REASON_IDS.includes(value);

export function reportReasonById(id: ReportReasonId): ReportReason {
  const found = REPORT_REASONS.find((reason) => reason.id === id);
  if (!found) throw new Error(`Unknown report reason: ${id}`);
  return found;
}

/**
 * The sheet.
 *
 * Written to be read by someone who is upset, so: what happens, in order,
 * before anything is asked of them. No "are you sure" — hesitating to report is
 * the failure mode this copy exists to remove, and a confirmation step would
 * add one more moment to talk yourself out of it.
 */
export const REPORT_COPY = {
  trigger: "Report {{FIRST_NAME}}",
  title: "Report {{FIRST_NAME}}",
  /** Said first, because it is the thing people are weighing. */
  lead: "This happens straight away, before anyone reviews it: you and {{FIRST_NAME}} disappear from each other's drops and can't be matched again this season.",
  privacy: "{{FIRST_NAME}} is never told who reported them.",
  chatNote:
    "This conversation will close. They'll see a neutral note saying it was closed by {{APP_NAME}} — not that you reported them, and not why.",
  reasonLabel: "What happened?",
  detailLabel: "Anything you want to add (optional)",
  detailPlaceholder: "In your own words. A real person reads this.",
  detailHint: "Only the review team sees this. {{FIRST_NAME}} never does.",
  confirm: "Send report",
  cancel: "Never mind",
  urgent:
    "If you're in danger right now, contact your local emergency services first. Then, if you can, email {{SUPPORT_EMAIL}} — it reaches a person the same day.",
  /**
   * After it is filed, on its own page.
   *
   * Not a thank-you — they did not do us a favour — and deliberately without a
   * name. This is read on a screen reached after the report has already taken
   * effect, at which point the person is invisible to them; printing the name
   * back would be the one place in the flow that still says it out loud.
   */
  doneTitle: "Reported.",
  doneBody:
    "A real person will read this. You and the person you reported won't see each other again this season — not in a drop, not in your inbox, not in a chat.",
  doneChat:
    "If you reported from a conversation, it's closed. They were told it was closed by {{APP_NAME}} — nothing about you, and nothing about why.",
  doneBack: "Back to tonight",
} as const;

/**
 * The warning a moderator sends — spec §7.3's "warn member".
 *
 * ⚠️ DRAFTED, not transcribed. §9 specifies no copy for this, and §13 says
 * missing copy is a question rather than something to improvise — so it was
 * asked and answered before this was written. It carries `signedOff: false`
 * like the drafted `lifecycle.ts` bodies, and wants a read before the first
 * real send.
 *
 * The hard part is §3.2: "never shame users", written for passing and closing —
 * and this is the one message in the product whose entire job is to tell
 * somebody they did something wrong. The way out is to be specific instead of
 * disappointed: what was reported, what happens if it continues, and what to do
 * if we have it wrong. No adjectives about them.
 *
 * Two things it must never say, and does not: who reported them, and anything
 * about the conversation it came from. Both would hand back the identity the
 * standards page promises to keep.
 */
export const MEMBER_WARNING = {
  signedOff: false,
  title: "A warning from the review team",
  lead: "Someone reported something you said or did on {{APP_NAME}}. A real person read it, looked at the context, and agreed with them.",
  category: "What was reported: {{CATEGORY}}.",
  privacy:
    "We won't tell you who reported you — that's a promise we make to everyone here, and it would still hold if you were the one reporting.",
  consequence:
    "If it happens again we'll remove you from the season. Removal closes every conversation you're having, each with a note to the other person; we don't make people disappear without a word, and that includes you.",
  standards: "The Community Standards are the whole rulebook, and they take two minutes to read.",
  appeal:
    "If you think we've got this wrong, email {{SUPPORT_EMAIL}}. A person reads it, and says so either way.",
  /** Deliberately not "I agree" — acknowledging is not the same as agreeing. */
  acknowledge: "I've read this",
} as const;
