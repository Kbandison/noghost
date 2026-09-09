/**
 * Closure notes — spec §9.2, verbatim.
 *
 * This is the product. Spec §10 lists the fuse, closure notes and decline
 * auto-notes as the three things that are never cut. Nothing here is
 * improvised, shortened, or A/B tested.
 */

/** Templates a member can choose when closing a chat themselves. */
export const CLOSURE_TEMPLATES = [
  {
    id: "closure_01",
    label: "Not the right match",
    body: "I've really enjoyed talking, but I don't think we're the right match. I wanted to tell you instead of disappearing. Genuinely — good luck out there.",
  },
  {
    id: "closure_02",
    label: "No spark",
    body: "You seem great, and I mean that. I'm just not feeling the connection I'm looking for. Thank you for the real conversation.",
  },
  {
    id: "closure_03",
    label: "Met someone",
    body: "I've connected with someone else this season and want to give that my full attention — you deserve someone who can. Thanks for the great conversation.",
  },
  {
    id: "closure_04",
    label: "Another life",
    body: "I think we might be a maybe-in-another-life. No hard feelings on my end — I hope none on yours.",
  },
  {
    id: "closure_05",
    label: "Being honest early",
    body: "I'd rather be honest now than distant later: I don't see this going where we both want. I respected you enough to say so.",
  },
  {
    id: "closure_06",
    label: "Stepping back",
    body: "I'm stepping back from this conversation, but I didn't want silence to do the talking. Wishing you a good rest of the season.",
  },
] as const;

export type ClosureTemplate = (typeof CLOSURE_TEMPLATES)[number];
export type ClosureTemplateId = ClosureTemplate["id"];

/** System-generated closures. No member picks these; the mechanics do. */
export const SYSTEM_CLOSURES = {
  /** The fuse ran out with no date on the calendar. */
  fuse_auto:
    "This chat reached the end of its seven days without a date on the calendar, so {{APP_NAME}} closed it for you both — no fault, no silence. Your next drop is at 8.",
  /** Sent to the person whose connect was declined. There is no reply channel. */
  decline_auto:
    "{{FIRST_NAME}} read your note and isn't able to connect this season. That's a real answer, not a maybe — which means you can spend your energy where it counts. See you at tonight's drop.",
  /**
   * Sent to the sender when the season ends with their note still unanswered
   * — §6.2's "decline auto-note variant".
   *
   * ⚠️ DRAFTED, not transcribed. §9.2 lists the four notes above and not this
   * one, and §13 says missing copy is a question rather than something to
   * improvise; it is drafted here because the alternative was shipping the
   * mechanic without it, which is the ghost this whole change removes. Marked
   * in `UNSIGNED_CLOSURES` below and wants a read before the first real send.
   *
   * It exists because `decline_auto` is *false* here. That copy says "read your
   * note and isn't able to connect" — nobody read it. Telling a sender they
   * were turned down when they were in fact never answered is a worse ending
   * than the silence, because it invents a person's decision for them.
   *
   * §3.2 forbids shaming, and that cuts both ways: this must not blame the
   * recipient either. Nobody did anything wrong; the clock ran out.
   */
  expired_auto:
    "The season ended before {{FIRST_NAME}} answered your note. No decision was made about you — the clock simply ran out on them, and you deserve to know that rather than wonder. Thank you for writing something real.",
  /** Sent to the partners of a removed member. Even removal doesn't ghost. */
  removal:
    "This conversation was closed by {{APP_NAME}} and won't continue. It's nothing you did. Your next drop is at 8.",
  /** Delivered to every still-open chat when the season closes. */
  season_end:
    "{{SEASON_NAME}} has ended — and this conversation doesn't have to. If you'd both like to keep talking, share contact info below before the app goes quiet. Either way: thank you for ending things the {{APP_NAME}} way all season. 👻",
} as const;

export type SystemClosureId = keyof typeof SYSTEM_CLOSURES;

/**
 * System closures that are drafted rather than transcribed from §9.2, the way
 * `MEMBER_WARNING` and the `lifecycle.ts` bodies are. Listed rather than
 * carried on each entry so `SYSTEM_CLOSURES` stays a plain id → string map that
 * every caller can index without unwrapping.
 */
export const UNSIGNED_CLOSURES: readonly SystemClosureId[] = ["expired_auto"];

/** Every template id that can land in `closure_notes.template_id`. */
export type AnyClosureId = ClosureTemplateId | SystemClosureId;

export function closureTemplateById(id: ClosureTemplateId): ClosureTemplate {
  const found = CLOSURE_TEMPLATES.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown closure template: ${id}`);
  return found;
}

/** Copy for the decline confirmation sheet — spec §7.2 Inbox. */
export const DECLINE_CONFIRM = {
  title: "Decline this connect?",
  body: "They'll get a real answer, not silence.",
  detail:
    "{{FIRST_NAME}} will receive a short, kind note letting them know you're not able to connect this season. They can't reply to it, and they can't write to you again this season.",
  confirm: "Send the note",
  cancel: "Go back",
} as const;

/** Copy for the close-a-chat flow — spec §7.2 Chat detail. */
export const CLOSE_CHAT = {
  title: "Close this kindly",
  body: "Pick what's true. You can add a line of your own if you want to — you don't have to.",
  personalLineLabel: "Add a personal line (optional)",
  personalLinePlaceholder: "Something you actually mean.",
  confirm: "Send and close",
  cancel: "Not yet",
} as const;
