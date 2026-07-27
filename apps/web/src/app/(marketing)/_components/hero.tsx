import { interpolate, type CopyVars } from "@noghost/config";
import { HERO } from "@noghost/config/copy";
import { ButtonLink } from "@/components/ui/button";
import { Ghost, HandUnderline } from "@/components/ui/ghost";

/**
 * VARIANCE 4 → split screen (COMPONENTS.md hero variants). The right column is
 * the three mechanics as a magazine sidebar rather than an image: there is no
 * photography yet, and a placeholder service would ship as visible demo code
 * (WORKFLOW.md Phase 4).
 *
 * No `cv-auto` and no scroll-reveal here — the hero has to be readable within
 * three seconds, so nothing about it waits on JavaScript.
 */
export function Hero({ vars }: { vars: CopyVars }) {
  return (
    <section className="relative flex min-h-[100dvh] items-center overflow-hidden pt-24 pb-20">
      <div className="mx-auto grid w-full max-w-[var(--content-max)] grid-cols-1 items-center gap-16 px-6 md:px-8 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-7">
          <h1 className="font-[family-name:var(--font-display)] text-[clamp(2.75rem,7vw,5.25rem)] font-extrabold leading-[1.02] tracking-[-0.035em]">
            Dating with a{" "}
            <span className="relative inline-block whitespace-nowrap">
              start date
              <HandUnderline className="absolute -bottom-1 left-0 text-[var(--accent)]" />
            </span>
            .
          </h1>

          <p className="prose-measure mt-8 text-[19px] leading-[1.65] text-[var(--text-secondary)]">
            {interpolate(HERO.body, vars)}
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-4">
            <ButtonLink href="/apply">{interpolate(HERO.cta, vars)}</ButtonLink>
            <p className="text-[15px] text-[var(--text-dim)]">
              {interpolate(HERO.applicationsClose, vars)}
            </p>
          </div>

          {/*
           * The honest number, straight from the database. There is exactly one
           * scarcity claim on this page and it is true (spec §3.3 bans the
           * dark-pattern kind).
           */}
          <p className="mt-6 flex items-center gap-2.5 text-[15px] text-[var(--sage-text)]">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--sage-text)]"
            />
            {interpolate(HERO.seatsRemaining, vars)}
          </p>
        </div>

        <aside className="lg:col-span-5 lg:pl-8">
          <div className="border-l-2 border-[var(--accent)] pl-6 md:pl-8">
            <Ghost className="mb-7 h-11 w-11 text-[var(--accent)]" />
            <dl className="space-y-6">
              <SidebarItem term="8:00 PM">
                Up to three people, chosen for you. Every night.
              </SidebarItem>
              <SidebarItem term="7 days">
                Every chat becomes a real date, or it closes with a kind note.
              </SidebarItem>
              <SidebarItem term="8 weeks">
                One city, one cohort, one finale. Then the next season begins.
              </SidebarItem>
            </dl>
          </div>
        </aside>
      </div>
    </section>
  );
}

function SidebarItem({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-[family-name:var(--font-display)] text-[26px] font-bold leading-none tracking-[-0.02em]">
        {term}
      </dt>
      <dd className="mt-2 text-[16px] leading-relaxed text-[var(--text-secondary)]">
        {children}
      </dd>
    </div>
  );
}
