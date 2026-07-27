import type { Metadata } from "next";
import { BRAND } from "@noghost/config";
import { LegalPage } from "@/components/layout/legal-page";

export const metadata: Metadata = { title: "Community Standards" };

export default function CommunityStandardsPage() {
  return (
    <LegalPage
      title="Community Standards"
      updated="July 2026"
      intro="Be someone worth meeting. Everything below is a specific version of that."
      sections={[
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
      ]}
    />
  );
}
