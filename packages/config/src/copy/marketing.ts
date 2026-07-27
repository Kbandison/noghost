/**
 * Marketing site copy — spec §9.1, verbatim.
 *
 * Brand and season values are `{{VAR}}` slots so nothing is hardcoded, but the
 * interpolated output is character-identical to the spec. Changing any wording
 * here requires owner sign-off (spec §9 header).
 */

export const HERO = {
  headline: "Dating with a start date.",
  body: "{{APP_NAME}} runs in {{SEASON_WEEKS}}-week seasons. Everyone starts together. Up to three people a night, chosen for you. Every conversation ends in a real date or a kind goodbye — never silence.",
  cta: "Apply for {{SEASON_NAME}}",
  applicationsClose: "Applications close {{APPS_CLOSE_DATE}}",
  seatsRemaining: "{{SEATS_REMAINING}} of {{MEMBER_CAP}} seats left",
} as const;

export const PROBLEM = {
  lines: [
    "The apps gave us infinite options and called it abundance.",
    "What we got was burnout, dead chats, and people who vanish.",
    "We built the opposite.",
  ],
} as const;

export const SEASON = {
  headline: "One city. {{MEMBER_CAP}} people. Eight weeks.",
  body: "A season has a start date, an end date, and a finale party. Everyone begins on day one — no stale profiles, no dead accounts, no wondering if anyone's actually here. When it ends, it ends. Then the next one begins.",
} as const;

export const DROP = {
  headline: "8:00 PM. Up to three people. That's the whole feed.",
  body: "No swiping, no scrolling, no wall of faces. Each night we introduce you to up to three people chosen for you. Read them properly — to say hello, you have to reply to something specific about them. There is no “like” button on {{APP_NAME}}.",
} as const;

export const FUSE = {
  headline: "Every chat has seven days to become a real date.",
  body: "Put a time and place on the calendar and the clock stops. Don't, and the chat closes on its own — with a kind note, both ways. {{APP_NAME}} isn't a texting app. It's how you meet.",
} as const;

export const CLOSURE_PROMISE = {
  headline: "Nobody gets ghosted here. Nobody.",
  body: "Every ending on {{APP_NAME}} comes with words. Decline someone — they get a kind note. A chat runs out of road — a kind note. It's not always a yes. It's always an answer.",
} as const;

export const PRICING = {
  headline: "One pass. One season. That's the business model.",
  body: "{{PRICE_EARLY}} early bird (first {{EARLY_BIRD_CAP}} admitted) · {{PRICE_STANDARD}} standard. Applying is free — you only pay if you're admitted. No subscription, no premium tier, no paying to be seen. We make money when you show up, not when you stay single.",
} as const;

export const VERIFICATION_STRIP = {
  body: "Every member is phone-verified, selfie-verified, and approved by a human before day one. Yes, a person looks at every application. That's the point.",
} as const;

export const FAQ = [
  {
    id: "why-apply",
    question: "Why do I have to apply?",
    answer:
      "Because {{MEMBER_CAP}} verified, ready people beat 30,000 maybes. Admissions is how we keep the ratio balanced and the bots at zero.",
  },
  {
    id: "not-admitted",
    question: "What if I don't get admitted this season?",
    answer: "You're first in line for Season Two, no re-application needed.",
  },
  {
    id: "season-ends",
    question: "What happens when the season ends?",
    answer:
      "The app goes quiet until next season. Ongoing chats get each other's contact info option before close. Real connections leave the app — that's success, not churn.",
  },
  {
    id: "pay-for-more",
    question: "Can I pay for more drops or more time?",
    answer: "No. Nobody can. That's a promise, not a tier we haven't built yet.",
  },
  {
    id: "selfie-storage",
    question: "Is my selfie verification stored?",
    answer:
      "It's used for approval, visible only to our review team, and deletable on request. Never shown to other members.",
  },
  {
    id: "algorithm-hiding",
    question: "Does the algorithm hide me if people pass on me?",
    answer:
      "No. We don't rank you by desirability and we never suppress profiles. The one nudge we make: spreading attention so the same ten people don't get every connect. Everyone gets seen.",
  },
] as const;

export type FaqItem = (typeof FAQ)[number];
