import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { interpolate } from "@noghost/config";
import { FAQ } from "@noghost/config/copy";
import { getPublicSeasonStats } from "@noghost/db";
import { Reveal } from "@/components/animations/reveal";
import { Eyebrow, Section } from "@/components/layout/section";
import { ButtonLink } from "@/components/ui/button";
import { seasonVars } from "@/lib/season-copy";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "FAQ",
  description: "Why we make you apply, what happens when a season ends, and what you can't buy.",
};

export default async function FaqPage() {
  const season = await getPublicSeasonStats();
  if (!season) notFound();
  const vars = seasonVars(season);

  return (
    <>
      <Section className="pb-0">
        <Eyebrow className="mb-6">FAQ</Eyebrow>
        <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-[clamp(2.5rem,6vw,4.25rem)] font-extrabold leading-[1.04] tracking-[-0.032em]">
          The questions worth answering.
        </h1>
      </Section>

      <Section>
        {/*
         * Answers are open, not collapsed. An accordion would hide the two
         * answers this product most needs read — that nothing can be bought,
         * and that nobody is suppressed.
         */}
        <dl className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {FAQ.map((item) => (
            <Reveal key={item.id} className="grid grid-cols-1 gap-4 py-10 lg:grid-cols-12 lg:gap-10">
              <dt className="font-[family-name:var(--font-display)] text-[21px] font-semibold leading-snug tracking-[-0.012em] lg:col-span-5">
                {item.question}
              </dt>
              <dd className="text-[17px] leading-[1.72] text-[var(--text-secondary)] lg:col-span-7">
                {interpolate(item.answer, vars)}
              </dd>
            </Reveal>
          ))}
        </dl>
      </Section>

      <Section tone="sunken" className="text-center">
        <Reveal>
          <h2 className="font-[family-name:var(--font-display)] text-[clamp(1.875rem,4vw,2.75rem)] font-bold leading-[1.1] tracking-[-0.025em]">
            Still deciding?
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-[17px] leading-relaxed text-[var(--text-secondary)]">
            Applying is free. You only pay if a person reads your application and says yes.
          </p>
          <div className="mt-9">
            <ButtonLink href="/apply">Apply for {season.name}</ButtonLink>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
