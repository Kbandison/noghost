import Link from "next/link";
import { interpolate, type CopyVars } from "@noghost/config";
import { FAQ, HERO, PRICING } from "@noghost/config/copy";
import { Reveal, RevealGroup } from "@/components/animations/reveal";
import { Eyebrow, Section } from "@/components/layout/section";
import { ButtonLink } from "@/components/ui/button";
import { Ghost } from "@/components/ui/ghost";

export function Pricing({ vars }: { vars: CopyVars }) {
  return (
    <Section id="pricing">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-14">
        <Reveal className="lg:col-span-7">
          <Eyebrow className="mb-5">Pricing</Eyebrow>
          <h2 className="font-[family-name:var(--font-display)] text-[clamp(1.875rem,3.6vw,2.75rem)] font-bold leading-[1.1] tracking-[-0.022em]">
            {interpolate(PRICING.headline, vars)}
          </h2>
          <p className="prose-measure mt-7 text-[17px] leading-[1.72] text-[var(--text-secondary)]">
            {interpolate(PRICING.body, vars)}
          </p>
        </Reveal>

        {/*
         * Two prices, stated plainly. No feature-comparison table, because
         * there is nothing to compare — spec §3.3 bans premium tiers outright,
         * and a pricing grid would imply one exists.
         */}
        <Reveal delay={0.08} className="lg:col-span-5">
          <div className="border border-[var(--border)] bg-[var(--bg-tertiary)] p-8">
            <PriceRow
              price={String(vars.PRICE_EARLY)}
              label="Early bird"
              note={`First ${vars.EARLY_BIRD_CAP} admitted`}
            />
            <div className="my-6 h-px w-full bg-[var(--border-subtle)]" />
            <PriceRow price={String(vars.PRICE_STANDARD)} label="Standard" note="Everyone after" />
            <ul className="mt-8 space-y-3 border-t border-[var(--border-subtle)] pt-7 text-[15px] text-[var(--text-secondary)]">
              {[
                "The full season, every nightly drop",
                "The finale event",
                "Nothing else to buy. Ever.",
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden="true" className="mt-2 h-1 w-3 shrink-0 bg-[var(--accent)]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

function PriceRow({ price, label, note }: { price: string; label: string; note: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div>
        <p className="font-[family-name:var(--font-display)] text-[40px] font-extrabold leading-none tracking-[-0.03em]">
          {price}
        </p>
        <p className="mt-2 text-[15px] text-[var(--text-secondary)]">{label}</p>
      </div>
      <p className="text-right text-[14px] text-[var(--text-dim)]">{note}</p>
    </div>
  );
}

/** The three questions people actually ask before applying. Rest live on /faq. */
export function FaqPreview({ vars }: { vars: CopyVars }) {
  const preview = FAQ.filter((q) =>
    ["why-apply", "pay-for-more", "algorithm-hiding"].includes(q.id),
  );

  return (
    <Section tone="sunken">
      <Reveal>
        <Eyebrow className="mb-5">Before you ask</Eyebrow>
      </Reveal>
      <RevealGroup className="mt-10 divide-y divide-[var(--border)] border-y border-[var(--border)]">
        {preview.map((item) => (
          <div key={item.id} className="grid grid-cols-1 gap-4 py-8 lg:grid-cols-12 lg:gap-10">
            <h3 className="font-[family-name:var(--font-display)] text-[20px] font-semibold leading-snug tracking-[-0.012em] lg:col-span-5">
              {item.question}
            </h3>
            <p className="text-[17px] leading-[1.7] text-[var(--text-secondary)] lg:col-span-7">
              {interpolate(item.answer, vars)}
            </p>
          </div>
        ))}
      </RevealGroup>
      <Reveal delay={0.1} className="mt-10">
        <Link
          href="/faq"
          className="text-[16px] text-[var(--accent-text)] underline decoration-[1.5px] underline-offset-4 transition-all hover:decoration-[2.5px]"
        >
          Read every question
        </Link>
      </Reveal>
    </Section>
  );
}

/**
 * ⚠️ §9.1 specifies this section's structure ("Apply CTA with live
 * seats-remaining counter") but gives no wording for it. The two lines below
 * are therefore drafted, not transcribed — flagged for owner sign-off with the
 * email bodies in `lifecycle.ts`. Everything else on this page is verbatim.
 */
export function ApplyCta({ vars }: { vars: CopyVars }) {
  return (
    <Section className="text-center">
      <Reveal className="mx-auto max-w-3xl">
        <Ghost className="mx-auto mb-9 h-14 w-14 text-[var(--accent)]" />
        <h2 className="font-[family-name:var(--font-display)] text-[clamp(2.25rem,5vw,3.75rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
          {interpolate("{{SEATS_REMAINING}} seats left in {{SEASON_NAME}}.", vars)}
        </h2>
        <p className="mx-auto mt-7 max-w-xl text-[18px] leading-[1.6] text-[var(--text-secondary)]">
          Applying is free and takes about ten minutes. A person reads every one.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4">
          <ButtonLink href="/apply">{interpolate(HERO.cta, vars)}</ButtonLink>
          <p className="text-[15px] text-[var(--text-dim)]">
            {interpolate(HERO.applicationsClose, vars)}
          </p>
        </div>
      </Reveal>
    </Section>
  );
}
