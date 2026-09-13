/**
 * Email & SMS lifecycle copy — spec §9.5.
 *
 * ⚠️ Sign-off status differs by field:
 *   - `subject` and `sms` are VERBATIM from §9.5.
 *   - `body` blocks are DRAFTED from the §9.5 body requirements, which the
 *     spec states as content bullets rather than finished prose. They are the
 *     only user-facing strings in this codebase that were authored rather than
 *     transcribed. Flagged for owner sign-off before the first real send.
 */

export const LIFECYCLE_EMAILS = {
  application_received: {
    signedOff: false,
    subject: "Application received — {{SEASON_NAME}}",
    preheader: "Here's what happens next.",
    body: [
      "Thanks for applying to {{SEASON_NAME}}. Your application is in.",
      "Next: a real person on our review team checks your verification and your profile. You'll hear back within five days either way — we don't leave applications hanging any more than we leave conversations hanging.",
      "You haven't paid anything, and you won't unless you're admitted.",
      "This email comes from a human. Reply to it if you have a question.",
    ],
  },

  admitted_claim: {
    signedOff: false,
    subject: "You're in. Claim your seat in {{SEASON_NAME}}.",
    preheader: "Your seat is held for {{CLAIM_HOURS}} hours.",
    body: [
      // Not "a person read your application and said yes" — since auto-admit
      // that is false for everybody the identity check clears, and this is the
      // one message they are certain to read. The outcome is the news; how it
      // was reached is on the review screen, which knows which door they came
      // through.
      "You're admitted to {{SEASON_NAME}}.",
      "Your pass is {{PRICE}}. Your seat is held until {{CLAIM_DEADLINE}} — after that it goes to the next person on the waitlist. That deadline is real, and it's the only countdown we'll ever put in front of you besides the fuse.",
      "What the pass includes: the full {{SEASON_WEEKS}} weeks, every nightly drop, and the finale event. That's everything. There is no upgrade, no premium tier, and nothing else to buy — not this season, not ever.",
    ],
    cta: "Claim your seat",
    sms: "{{APP_NAME}}: you're admitted to {{SEASON_NAME}}. Claim your seat within {{CLAIM_HOURS}}h: {{LINK}}",
  },

  claim_reminder: {
    signedOff: true,
    smsOnly: true,
    sms: "24h left to claim your {{APP_NAME}} seat. After that it goes to the waitlist: {{LINK}}",
  },

  season_start: {
    signedOff: false,
    subject: "Day one. 👻",
    preheader: "Your first drop lands at 8:00 PM tonight.",
    body: [
      "{{SEASON_NAME}} starts today. Everyone you'll meet this season started today too.",
      "Tonight at 8:00 PM you'll get your first drop: up to three people, chosen for you. Read them properly. To say hello you reply to something specific — there's no like button here.",
      "The three rules, once: Up to three people a night, at 8. Every chat has seven days to become a real date, or it closes on its own. Every ending comes with words — no one on {{APP_NAME}} can be ghosted.",
      "The finale is {{SEASON_END_DATE}}. Put it in your calendar now.",
      "Be someone worth meeting. That's the whole code of conduct.",
    ],
  },

  season_finale: {
    signedOff: false,
    subject: "Final week of {{SEASON_NAME}}.",
    preheader: "What happens to your open chats when the season closes.",
    body: [
      "This is the last week of {{SEASON_NAME}}. Drops run through {{SEASON_END_DATE}}, then the app goes quiet.",
      "Finale event details are in the app.",
      "When the season closes, every open chat gets a note and the option to swap contact info. Real connections leave the app — that's the point, not a leak.",
      "One ask: the exit survey is three questions and it decides what Season Two looks like.",
      "Season Two pricing goes to this cohort first.",
    ],
  },
} as const;

export type LifecycleTemplateKey = keyof typeof LIFECYCLE_EMAILS;

/** Templates still awaiting owner sign-off on their body copy. */
export const UNSIGNED_LIFECYCLE_TEMPLATES = (
  Object.entries(LIFECYCLE_EMAILS) as [LifecycleTemplateKey, { signedOff: boolean }][]
)
  .filter(([, t]) => !t.signedOff)
  .map(([key]) => key);
