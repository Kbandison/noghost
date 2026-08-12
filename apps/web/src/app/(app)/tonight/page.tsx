import type { Metadata } from "next";
import { DROP_COPY, EMPTY_STATES } from "@noghost/config/copy";
import { Ghost } from "@/components/ui/ghost";
import { requireMember } from "@/lib/member";
import { tonightsDrop } from "@/lib/drop";
import { Countdown } from "./countdown";
import { DropStack } from "./drop-stack";

export const metadata: Metadata = { title: "Tonight" };
export const dynamic = "force-dynamic";

/**
 * Tonight — spec §7.2, the Drop.
 *
 * Four screens, and none of them is an error:
 *
 *   no-season      the season hasn't started, or it's over
 *   before-release built but not landed, or not built yet — same sentence either way
 *   quiet-night    released with nobody eligible. §9.6 says this out loud.
 *   released       up to three people, one at a time (Focus Mode)
 *
 * The quiet night is the one worth defending. Padding a thin drop with weak
 * matches is the easy way to never show this screen, and §6.1 calls not doing
 * that a promise rather than a limitation.
 */
export default async function TonightPage() {
  const member = await requireMember();
  const now = new Date().toISOString();
  const drop = await tonightsDrop(member.id, now);

  if (member.status === "paused") {
    return (
      <Shell>
        <Ghost className="mb-6 h-16 w-16" />
        <h1 className="font-[family-name:var(--font-display)] text-[30px] font-extrabold leading-[1.15] tracking-[-0.03em]">
          Your account is paused.
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-[var(--text-secondary)]">
          No drops, and nobody sees you in theirs. Nothing is lost &mdash; unpause from your
          profile whenever you want the season back.
        </p>
      </Shell>
    );
  }

  if (member.status === "found_someone") {
    return (
      <Shell>
        <Ghost className="mb-6 h-16 w-16" />
        <h1 className="font-[family-name:var(--font-display)] text-[30px] font-extrabold leading-[1.15] tracking-[-0.03em]">
          You found someone.
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-[var(--text-secondary)]">
          That&rsquo;s the whole point of this, so the drops have stopped. Go be with them.
        </p>
      </Shell>
    );
  }

  if (drop.kind === "no-season") {
    return (
      <Shell>
        <Ghost className="mb-6 h-16 w-16" />
        <h1 className="font-[family-name:var(--font-display)] text-[30px] font-extrabold leading-[1.15] tracking-[-0.03em]">
          {drop.startsAt && Date.parse(drop.startsAt) > Date.parse(now)
            ? "Not yet."
            : "That season is a wrap."}
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-[var(--text-secondary)]">
          {drop.startsAt && Date.parse(drop.startsAt) > Date.parse(now) ? (
            <>
              {drop.seasonName ?? "The season"} starts{" "}
              {new Date(drop.startsAt).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
              . Everyone begins together &mdash; that&rsquo;s the point of a season.
            </>
          ) : (
            <>Thanks for being in it. We&rsquo;ll write when the next one opens.</>
          )}
        </p>
      </Shell>
    );
  }

  if (drop.kind === "before-release") {
    return (
      <Shell>
        <Ghost className="mb-6 h-16 w-16" />
        <h1 className="font-[family-name:var(--font-display)] text-[30px] font-extrabold leading-[1.15] tracking-[-0.03em]">
          {DROP_COPY.preDrop}
        </h1>
        <Countdown to={drop.releasesAt} />
      </Shell>
    );
  }

  if (drop.kind === "quiet-night") {
    return (
      <Shell>
        <Ghost className="mb-6 h-16 w-16" />
        {/*
          One element, and the §9.6 string is printed whole. Splitting it into a
          heading and a body meant slicing the sentence with a regex, and §13 is
          explicit that this copy is verbatim — the promise it makes is the
          reason the screen exists.
        */}
        <h1 className="font-[family-name:var(--font-display)] text-[24px] font-bold leading-[1.35] tracking-[-0.02em]">
          {EMPTY_STATES.quietNight}
        </h1>
        <Countdown to={drop.nextReleaseAt} />
      </Shell>
    );
  }

  return (
    <DropStack
      firstName={member.firstName}
      cards={drop.cards}
      nextReleaseAt={drop.nextReleaseAt}
    />
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-[34rem] flex-col items-center justify-center px-6 py-20 text-center">
      {children}
    </div>
  );
}
