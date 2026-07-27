import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { interpolate } from "@noghost/config";
import {
  CLOSURE_PROMISE,
  DROP,
  FUSE,
  SEASON,
  VERIFICATION_STRIP,
} from "@noghost/config/copy";
import { getPublicSeasonStats } from "@noghost/db";
import { Reveal } from "@/components/animations/reveal";
import { Eyebrow, Section } from "@/components/layout/section";
import { ButtonLink } from "@/components/ui/button";
import { seasonVars } from "@/lib/season-copy";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Eight-week seasons, a nightly drop at 8, a seven-day fuse on every chat, and an ending with words.",
};

export default async function HowItWorksPage() {
  const season = await getPublicSeasonStats();
  if (!season) notFound();
  const vars = seasonVars(season);

  const chapters = [
    { n: "01", eyebrow: "The season", ...SEASON },
    { n: "02", eyebrow: "The drop", ...DROP },
    { n: "03", eyebrow: "The fuse", ...FUSE },
    { n: "04", eyebrow: "The closure", ...CLOSURE_PROMISE },
  ];

  return (
    <>
      <Section className="pb-0">
        <Eyebrow className="mb-6">How it works</Eyebrow>
        <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-[clamp(2.5rem,6vw,4.25rem)] font-extrabold leading-[1.04] tracking-[-0.032em]">
          Four rules. That&rsquo;s the whole product.
        </h1>
        <p className="prose-measure mt-8 text-[19px] leading-[1.65] text-[var(--text-secondary)]">
          None of them can be bought out of, extended, or skipped &mdash; not by you, not by
          anyone. That is what makes them worth agreeing to.
        </p>
      </Section>

      <Section innerClassName="space-y-20 md:space-y-28">
        {chapters.map((chapter, i) => (
          <div key={chapter.n}>
            {i > 0 && <div className="mb-20 h-px w-full bg-[var(--border-subtle)] md:mb-28" />}
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-14">
              <Reveal className="lg:col-span-4">
                <p className="font-[family-name:var(--font-display)] text-[64px] font-extrabold leading-none tracking-[-0.04em] text-[var(--border)]">
                  {chapter.n}
                </p>
                <Eyebrow className="mt-4">{chapter.eyebrow}</Eyebrow>
              </Reveal>
              <Reveal delay={0.08} className="lg:col-span-8">
                <h2 className="font-[family-name:var(--font-display)] text-[clamp(1.75rem,3.2vw,2.5rem)] font-bold leading-[1.1] tracking-[-0.022em]">
                  {interpolate(chapter.headline, vars)}
                </h2>
                <p className="prose-measure mt-6 text-[17px] leading-[1.72] text-[var(--text-secondary)]">
                  {interpolate(chapter.body, vars)}
                </p>
              </Reveal>
            </div>
          </div>
        ))}
      </Section>

      <Section tone="sunken">
        <Reveal>
          <Eyebrow className="mb-5">Getting in</Eyebrow>
          <p className="prose-measure text-[19px] leading-[1.65] text-[var(--text-secondary)]">
            {interpolate(VERIFICATION_STRIP.body, vars)}
          </p>
          <div className="mt-10">
            <ButtonLink href="/apply">Apply for {season.name}</ButtonLink>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
