/** Drop & encore copy — spec §9.3, verbatim. */

export const DROP_COPY = {
  /** Before 8:00 PM. Ghost mascot idles beside the countdown. */
  preDrop: "Tonight's drop lands at 8:00.",
  header: "Tonight, {{FIRST_NAME}}.",
  subheader:
    "{{N}} people, chosen for you. Take your time — they're not going anywhere for 24 hours.",
  encoreBanner:
    "**Encore.** You passed on {{FIRST_NAME}} in week {{WEEK}}. Six weeks of this season later, people read differently. One more look — no pressure.",
  composerHelper: "Reply to something specific. It's the only way to say hello here.",
} as const;

/**
 * Card actions — spec §6.2. A pass is silent and final; the other person is
 * never told. That is deliberate and is not a missing notification.
 */
export const CARD_ACTIONS = {
  pass: "Pass",
  passHint: "Quiet and final. They're never told.",
  connect: "Reply to connect",
} as const;
