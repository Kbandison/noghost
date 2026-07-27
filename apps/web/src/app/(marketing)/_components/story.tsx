import { interpolate, type CopyVars } from "@noghost/config";
import {
  CLOSURE_PROMISE,
  DROP,
  FUSE,
  PROBLEM,
  SEASON,
  VERIFICATION_STRIP,
} from "@noghost/config/copy";
import { Reveal, RevealGroup } from "@/components/animations/reveal";
import { Eyebrow, Section } from "@/components/layout/section";

/**
 * The four mechanics, in the order §7.1 specifies: Problem → Season → Drop →
 * Fuse → Closure.
 *
 * VARIANCE 4 means mixed alignment, not uniform centring (anti-slop #1): the
 * problem is a centred statement, the mechanics alternate as 5/7 splits, and
 * the closure promise stands alone.
 */

export function Problem() {
  return (
    <Section tone="sunken">
      <RevealGroup className="mx-auto max-w-3xl text-center">
        {PROBLEM.lines.map((line, i) => (
          <p
            key={line}
            className={
              i === PROBLEM.lines.length - 1
                ? "font-[family-name:var(--font-display)] text-[clamp(1.75rem,3.4vw,2.6rem)] font-bold leading-[1.15] tracking-[-0.022em]"
                : "text-[clamp(1.25rem,2.4vw,1.6rem)] leading-[1.45] text-[var(--text-secondary)]"
            }
            style={i < PROBLEM.lines.length - 1 ? { marginBottom: "0.6em" } : { marginTop: "0.5em" }}
          >
            {line}
          </p>
        ))}
      </RevealGroup>
    </Section>
  );
}

/** A mechanic: number, headline, body. Alternates side down the page. */
function Mechanic({
  index,
  eyebrow,
  headline,
  body,
  flip = false,
}: {
  index: string;
  eyebrow: string;
  headline: string;
  body: string;
  flip?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-14">
      <Reveal className={flip ? "lg:col-span-7 lg:order-2" : "lg:col-span-7"}>
        <Eyebrow className="mb-5">
          <span className="mr-3 text-[var(--text-dim)]">{index}</span>
          {eyebrow}
        </Eyebrow>
        <h2 className="font-[family-name:var(--font-display)] text-[clamp(1.875rem,3.6vw,2.75rem)] font-bold leading-[1.1] tracking-[-0.022em]">
          {headline}
        </h2>
      </Reveal>
      <Reveal
        delay={0.08}
        className={flip ? "lg:col-span-5 lg:order-1 lg:pt-14" : "lg:col-span-5 lg:pt-14"}
      >
        <p className="prose-measure text-[17px] leading-[1.72] text-[var(--text-secondary)]">
          {body}
        </p>
      </Reveal>
    </div>
  );
}

export function Mechanics({ vars }: { vars: CopyVars }) {
  return (
    <Section id="how" innerClassName="space-y-24 md:space-y-32">
      <Mechanic
        index="01"
        eyebrow="The season"
        headline={interpolate(SEASON.headline, vars)}
        body={interpolate(SEASON.body, vars)}
      />
      <div className="h-px w-full bg-[var(--border-subtle)]" />
      <Mechanic
        index="02"
        eyebrow="The drop"
        headline={interpolate(DROP.headline, vars)}
        body={interpolate(DROP.body, vars)}
        flip
      />
      <div className="h-px w-full bg-[var(--border-subtle)]" />
      <Mechanic
        index="03"
        eyebrow="The fuse"
        headline={interpolate(FUSE.headline, vars)}
        body={interpolate(FUSE.body, vars)}
      />
    </Section>
  );
}

/**
 * The closure promise. Given the whole viewport width and no competing element
 * — it is the single sentence the brand is built on.
 */
export function ClosurePromise({ vars }: { vars: CopyVars }) {
  return (
    <Section tone="sunken">
      <Reveal className="mx-auto max-w-4xl">
        <Eyebrow className="mb-6">The promise</Eyebrow>
        <h2 className="font-[family-name:var(--font-display)] text-[clamp(2.25rem,5.5vw,4rem)] font-extrabold leading-[1.04] tracking-[-0.03em]">
          {interpolate(CLOSURE_PROMISE.headline, vars)}
        </h2>
        <p className="prose-measure mt-8 text-[19px] leading-[1.65] text-[var(--text-secondary)]">
          {interpolate(CLOSURE_PROMISE.body, vars)}
        </p>
      </Reveal>
    </Section>
  );
}

/** A thin band, not a section. Verification is reassurance, not a chapter. */
export function VerificationStrip({ vars }: { vars: CopyVars }) {
  return (
    <div className="border-y border-[var(--border-subtle)] bg-[var(--bg-primary)]">
      <div className="mx-auto w-full max-w-[var(--content-max)] px-6 py-12 md:px-8">
        <Reveal>
          <p className="prose-measure text-[17px] leading-[1.7] text-[var(--text-secondary)]">
            {interpolate(VERIFICATION_STRIP.body, vars)}
          </p>
        </Reveal>
      </div>
    </div>
  );
}
