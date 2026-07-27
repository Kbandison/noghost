import type { Metadata } from "next";
import { BRAND } from "@noghost/config";
import { getPublicSeasonStats } from "@noghost/db";
import { Eyebrow, Section } from "@/components/layout/section";
import { WaitlistForm } from "./waitlist-form";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Waitlist",
  description: "Other cities, and the next season in Atlanta.",
};

export default async function WaitlistPage() {
  const season = await getPublicSeasonStats();
  const full = season ? season.seatsRemaining <= 0 : true;

  return (
    <Section>
      <div className="grid grid-cols-1 gap-14 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <Eyebrow className="mb-6">Waitlist</Eyebrow>
          <h1 className="font-[family-name:var(--font-display)] text-[clamp(2.25rem,5vw,3.5rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
            {full ? "This season is full." : "Not in Atlanta?"}
          </h1>
          <p className="prose-measure mt-7 text-[18px] leading-[1.65] text-[var(--text-secondary)]">
            {full
              ? `${season?.name} is at capacity. Leave your details and you're first in line for the next one — no re-application needed.`
              : `${BRAND.APP_NAME} runs one city at a time, on purpose. Tell us where you are and we'll let you know when a season opens there.`}
          </p>
          <p className="mt-6 text-[15px] text-[var(--text-dim)]">
            One email when there&rsquo;s news. Nothing else, ever.
          </p>
        </div>

        <div className="lg:col-span-6 lg:pl-8">
          <WaitlistForm defaultCity={BRAND.CITY_S1} />
        </div>
      </div>
    </Section>
  );
}
