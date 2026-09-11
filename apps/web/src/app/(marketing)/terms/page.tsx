import type { Metadata } from "next";
import { BRAND } from "@noghost/config";
import { LegalPage } from "@/components/layout/legal-page";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms"
      updated="July 2026"
      intro={`${BRAND.APP_NAME} sells one thing: a pass to one season in one city. These terms cover what that buys you and what it doesn't.`}
      sections={[
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
            "Applying is free. Admission is decided by a person and is not guaranteed. We admit to keep the cohort's matching segments balanced, which means a strong application can still be waitlisted.",
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
      ]}
    />
  );
}
