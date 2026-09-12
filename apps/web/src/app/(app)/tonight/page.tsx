import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DROP_COPY, EMPTY_STATES } from "@noghost/config/copy";
import { noSeasonReason } from "@noghost/logic";
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

  /*
   * Both status screens come before the drop query — neither of them reads it,
   * and a graduated member leaves here entirely.
   */
  if (member.status === "found_someone") redirect("/found-someone");

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

  const drop = await tonightsDrop(member.id, now);

  if (drop.kind === "no-season") {
    /*
     * Three cases, not two.
     *
     * This asked one question — "is the start date in the future?" — and called
     * everything else a finished season. `isSeasonServing` needs the phase to
     * be `live` or `finale_week`, and that column is written by a cron at 6 AM
     * ET, so moving a season's start to today after 6 AM made every paying
     * member read "That season is a wrap" on day one. `pre_season` had the same
     * problem by design, since it deliberately does not serve.
     *
     * `noSeasonReason` is unit-tested and is the only thing allowed to decide
     * that somebody's season has ended.
     */
    const reason = noSeasonReason(drop.phase, drop.startsAt, drop.endsAt, now);

    return (
      <Shell>
        <Ghost className="mb-6 h-16 w-16" />
        <h1 className="font-[family-name:var(--font-display)] text-[clamp(1.5rem,7vw,1.875rem)] font-extrabold leading-[1.15] tracking-[-0.03em]">
          {reason === "not-started"
            ? "Not yet."
            : reason === "over"
              ? "That season is a wrap."
              : "Any moment now."}
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-[var(--text-secondary)]">
          {reason === "not-started" && drop.startsAt ? (
            <>
              {drop.seasonName ?? "The season"} starts{" "}
              {new Date(drop.startsAt).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
              . Everyone begins together &mdash; that&rsquo;s the point of a season.
            </>
          ) : reason === "over" ? (
            <>Thanks for being in it. We&rsquo;ll write when the next one opens.</>
          ) : (
            /*
             * Deliberately vague about when, and deliberately certain about
             * what. The exact moment depends on a cron this screen cannot see,
             * so naming a time would be a promise it cannot keep — but the one
             * thing that is definitely true is that the season has not ended,
             * which is what the old copy got wrong.
             */
            <>
              {drop.seasonName ?? "The season"} has started and your first drop is being put
              together. Nothing is wrong and nothing is over &mdash; profiles land at 8:00 PM.
            </>
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
