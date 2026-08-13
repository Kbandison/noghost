import type { Metadata } from "next";
import { BRAND } from "@noghost/config";
import { CONSENT } from "@noghost/config/copy";
import { LegalPage } from "@/components/layout/legal-page";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="July 2026"
      intro={`${BRAND.APP_NAME} holds a phone number, a selfie, and a profile for every member. This page says exactly what we do with each of those, in plain language.`}
      sections={[
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
      ]}
    />
  );
}
