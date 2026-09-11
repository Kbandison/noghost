import { BRAND } from "../brand";
import { CONSENT } from "./legal";

/**
 * The three documents, in one place.
 *
 * They lived inline in their own page components, which was fine while a page
 * was the only way to read them. The last step of the funnel now opens them
 * where somebody is standing — they are agreeing to these, and making them
 * leave the application to find out what is in them is how nobody finds out.
 *
 * One source, two renderers. A document that said something different in the
 * dialog than on the page would be worse than not showing it at all.
 *
 * ⚠️ Drafted, NOT legally reviewed. Spec §9.8 supplies the three consent
 * strings verbatim; these surrounding documents are not in the spec and must go
 * past a lawyer before launch — a dating app holding selfies and phone numbers
 * is not a place to ship a template.
 */
export interface LegalDocument {
  slug: string;
  title: string;
  updated: string;
  intro: string;
  sections: { heading: string; body: string[] }[];
}

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  {
    slug: "terms",
    title: "Terms",
    updated: "July 2026",
    intro: `${BRAND.APP_NAME} sells one thing: a pass to one season in one city. These terms cover what that buys you and what it doesn't.`,
    sections: [
        {
          heading: "The pass",
          body: [
            "A season pass admits you to a single named season. It is a one-time payment, not a subscription, and nothing renews.",
            "The pass includes every nightly drop for the length of the season and entry to the finale event. There is no upgrade and no premium tier — not because we haven't built one, but because we have committed never to.",
          ],
        },
        {
          heading: "Admission and the claim window",
          body: [
            "Applying is free, and admission is not guaranteed. Most applications are read by a person; some are cleared by our identity check without one. We admit to keep the cohort's matching segments balanced, which means a strong application can still be waitlisted.",
            "If admitted, you have a stated window to buy your pass. When it expires the seat goes to the waitlist. That deadline is real and we will not extend it individually — doing so would take a seat from whoever was next.",
          ],
        },
        {
          heading: "Refunds",
          body: [
            "Full refund on request any time before the season's first drop. After day one, no refunds — the cohort is locked and your seat cannot be resold.",
            "If we remove you for breaking the community standards, no refund is due.",
          ],
        },
        {
          heading: "The mechanics are not negotiable",
          body: [
            "Up to three profiles a night. Seven days per chat without a confirmed date. Every ending carries a note. These apply identically to every member, and no payment, appeal, or exception changes them for anyone.",
          ],
        },
        {
          heading: "Age and location",
          body: [
            "Season One is limited to people 18 and over.",
          ],
        },
        {
          heading: "Ending your membership",
          body: [
            "You can pause or delete your account at any time. Deleting mid-season closes your open chats with a system note to your partners and does not entitle you to a refund.",
            `Questions go to ${BRAND.SUPPORT_EMAIL}.`,
          ],
        },
      ],
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    updated: "July 2026",
    intro: `${BRAND.APP_NAME} holds a phone number, a selfie, and a profile for every member. This page says exactly what we do with each of those, in plain language.`,
    sections: [
        {
          heading: "What we collect",
          body: [
            "Your phone number, which is how you sign in. Your name, birthdate, gender, who you're looking for, your neighbourhood, and the profile you write. Photos you upload. A verification selfie. Optionally, a voice intro and voice notes.",
            "We also record what the app does: which profiles you were shown, which you passed on, which connects you sent and received, and when chats opened and closed. Those records are what the season mechanics run on.",
          ],
        },
        {
          heading: "Your verification selfie",
          body: [
            CONSENT.selfie,
            "It is stored in a private bucket that no member can read. Only the review team can open it, through a short-lived signed link. Ask us and we delete it.",
          ],
        },
        {
          heading: "What other members can see",
          body: [
            "Your first name, age, gender, neighbourhood, height, occupation, photos, prompt answers, interests, and voice intro — and only once the app has actually introduced you: they appeared in your drop, one of you sent a connect, or you have a chat open.",
            "Your birthdate, phone number, and email are never shown to another member. Neither is your answer to a post-date check-in.",
          ],
        },
        {
          heading: "What we never do",
          body: [
            "We do not sell your data. We do not rank members by desirability, and we do not suppress anyone's profile based on how others responded to them.",
            "We do not use your messages to train anything. The one automated read is a tone check on the optional personal line in a closing note, and we store only whether it passed — never the text.",
          ],
        },
        {
          heading: "Deleting your account",
          body: [
            `Delete your account in Settings. Your open chats close first, each with a neutral system note to the other person, because your partners deserve an ending rather than a disappearance — that promise does not stop applying to the person leaving.`,
            `Then everything that is you is erased: your name, photos, prompts, voice, phone number, verification selfie, and what you wrote in those chats. The other person keeps their own words and the ending; they do not keep yours. Nothing is left that identifies you.`,
            `Your payment record stays, with nothing personal attached to it. It is how a refund or a billing question would be answered, and it is the one thing we keep.`,
            `Questions go to ${BRAND.SUPPORT_EMAIL} and reach a person.`,
          ],
        },
      ],
  },
  {
    slug: "community-standards",
    title: "Community Standards",
    updated: "July 2026",
    intro: "Be someone worth meeting. Everything below is a specific version of that.",
    sections: [
        {
          heading: "Be who you say you are",
          body: [
            "Your photos are of you and are recent. Your age is your age. Every member is phone-verified and selfie-verified before day one, and misrepresenting yourself is grounds for removal without a refund.",
          ],
        },
        {
          heading: "End things with words",
          body: [
            "This is the one rule the app enforces for you. You can pass on anyone, decline anyone, and close any chat — and none of those require a reason. What you cannot do is vanish, and the mechanics make sure of it.",
            "Do not try to route around it: no contact details in a closing note, no using a decline to send a message.",
          ],
        },
        {
          heading: "Kindness is not optional, but honesty is not unkind",
          body: [
            "“I don't see this going anywhere” is fine. “You're not attractive enough” is not. The line is whether the sentence exists to inform or to wound.",
            "The optional personal line on a closing note is checked before it sends. If it doesn't pass, you get a kinder rewrite to accept or ignore — and you are never prevented from closing the chat.",
          ],
        },
        {
          heading: "Show up",
          body: [
            "If you put a date on the calendar, go. Cancelling is fine and happens; not appearing is not. Repeated no-shows are grounds for removal.",
          ],
        },
        {
          heading: "Never",
          body: [
            "Harassment, threats, slurs, unsolicited explicit images, soliciting money, promoting a business, or bringing anyone under 21 into the season.",
          ],
        },
        {
          heading: "Reporting",
          body: [
            "Report from any profile or chat. Reporting immediately removes you and that person from each other's drops, before anyone reviews it. The person you report is never told who reported them.",
            `Anything urgent goes to ${BRAND.SUPPORT_EMAIL} and reaches a person the same day.`,
          ],
        },
        {
          heading: "What removal looks like",
          body: [
            "If we remove someone, their open chats close with a neutral system note to their partners. Even removal doesn't ghost anyone.",
          ],
        },
      ],
  },
];

export const legalDocument = (slug: string): LegalDocument | undefined =>
  LEGAL_DOCUMENTS.find((doc) => doc.slug === slug);
