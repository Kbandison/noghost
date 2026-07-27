import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { interpolate } from "@noghost/config";
import { CONSENT, HERO } from "@noghost/config/copy";
import { getPublicSeasonStats } from "@noghost/db";
import { Reveal } from "@/components/animations/reveal";
import { Eyebrow, Section } from "@/components/layout/section";
import { ButtonLink } from "@/components/ui/button";
import { seasonVars } from "@/lib/season-copy";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Apply",
  description: "Applying is free. You only pay if you're admitted.",
};

/**
 * The application's front door. Sets expectations before anyone types anything:
 * what the steps are, how long the review takes, and that nothing is charged
 * until a person says yes.
 */
export default async function ApplyPage() {
  const season = await getPublicSeasonStats();
  if (!season) notFound();
  const vars = seasonVars(season);

  const steps = [
    {
      n: "01",
      title: "Verify your phone",
      body: "A six-digit code. Your number is how you sign in, and it's the first of two things that prove you're a real person.",
    },
    {
      n: "02",
      title: "Build your profile",
      body: "Name, age, who you're looking for, your neighbourhood, three to six photos, and three prompts. Ten minutes, honestly answered.",
    },
    {
      n: "03",
      title: "Take a selfie",
      body: interpolate(CONSENT.selfie, vars),
    },
    {
      n: "04",
      title: "Wait for a person",
      body: "Someone on our review team reads every application. You'll hear back within five days either way.",
    },
    {
      n: "05",
      title: "Claim your seat",
      body: `If you're admitted you have ${season.claimHours} hours to buy your pass. That deadline is real — after it, the seat goes to the waitlist.`,
    },
  ];

  return (
    <>
      <Section className="pb-0">
        <Eyebrow className="mb-6">Apply · {season.name}</Eyebrow>
        <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-[clamp(2.5rem,6vw,4.25rem)] font-extrabold leading-[1.04] tracking-[-0.032em]">
          Applying is free. You only pay if you&rsquo;re in.
        </h1>
        <p className="prose-measure mt-8 text-[19px] leading-[1.65] text-[var(--text-secondary)]">
          {interpolate(HERO.seatsRemaining, vars)} &middot;{" "}
          {interpolate(HERO.applicationsClose, vars)}
        </p>
      </Section>

      <Section>
        <ol className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {steps.map((step) => (
            <Reveal
              key={step.n}
              as="li"
              className="grid grid-cols-1 gap-4 py-9 lg:grid-cols-12 lg:gap-10"
            >
              <div className="lg:col-span-4">
                <p className="font-[family-name:var(--font-display)] text-[15px] font-bold tracking-[0.08em] text-[var(--text-dim)]">
                  {step.n}
                </p>
                <h2 className="mt-1 font-[family-name:var(--font-display)] text-[21px] font-semibold tracking-[-0.012em]">
                  {step.title}
                </h2>
              </div>
              <p className="text-[17px] leading-[1.7] text-[var(--text-secondary)] lg:col-span-8">
                {step.body}
              </p>
            </Reveal>
          ))}
        </ol>

        <Reveal className="mt-14">
          <p className="prose-measure text-[15px] leading-relaxed text-[var(--text-dim)]">
            By starting, you confirm: {interpolate(CONSENT.application, vars)}
          </p>
          <div className="mt-8">
            <ButtonLink href="/apply/verify">Start with your phone number</ButtonLink>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
