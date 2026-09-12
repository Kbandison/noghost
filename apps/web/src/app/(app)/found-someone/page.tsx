import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Ghost } from "@/components/ui/ghost";
import { requireMember } from "@/lib/member";
import { supabaseServer } from "@/lib/supabase";
import { Confetti } from "./confetti";
import { ExitSurvey } from "./survey";

export const metadata: Metadata = { title: "You found someone" };
export const dynamic = "force-dynamic";

/**
 * The graduation screen — spec §6.5.
 *
 * "v1 just captures the data and celebrates in-app (confetti, ghost mascot
 * waving goodbye)." Both, and neither costs a dependency — see `confetti.tsx`.
 *
 * The exit survey is the three questions §6.5 names, and every one of them is
 * optional. Somebody who just met a person they like does not owe this product
 * a testimonial on the way out — the quote in particular is asked for, with
 * permission, rather than assumed.
 */
export default async function FoundSomeonePage() {
  const member = await requireMember();

  // Only reachable by someone who actually graduated. Anyone else is sent back
  // rather than shown a celebration that isn't theirs.
  if (member.status !== "found_someone") redirect("/tonight");

  const supabase = await supabaseServer();
  const { data: survey } = await supabase
    .from("exit_surveys")
    .select("id,season_id,dates_count,would_recommend,quote,submitted_at")
    .eq("season_id", member.seasonId)
    .maybeSingle();

  return (
    <div className="mx-auto w-full max-w-[34rem] px-6 py-16">
      {/* Only while the survey is unanswered — see `confetti.tsx`. */}
      {!survey?.submitted_at && <Confetti />}

      <div className="text-center">
        <Ghost className="mx-auto mb-6 h-20 w-20" title="The NoGhost mascot, waving goodbye" />
        <h1 className="font-[family-name:var(--font-display)] text-[34px] font-extrabold leading-[1.1] tracking-[-0.03em]">
          You found someone.
        </h1>
        <p className="mt-4 text-[18px] leading-relaxed text-[var(--text-secondary)]">
          That&rsquo;s the whole point of this, so we&rsquo;ve stopped. No more drops, and your
          other chats have been closed with a note saying why &mdash; nobody was left wondering.
        </p>
      </div>

      {survey?.submitted_at ? (
        <div className="mt-12 border-t border-[var(--border-subtle)] pt-8 text-center">
          <p className="text-[17px] leading-relaxed text-[var(--text-secondary)]">
            Thank you for telling us how it went. Go be with them.
          </p>
        </div>
      ) : (
        <div className="mt-12 border-t border-[var(--border-subtle)] pt-8">
          <h2 className="font-[family-name:var(--font-display)] text-[22px] font-bold tracking-[-0.02em]">
            Three questions, if you have a minute
          </h2>
          <p className="mt-1.5 text-[16px] leading-relaxed text-[var(--text-secondary)]">
            All optional. Skip any of them and it still counts as an answer.
          </p>
          <div className="mt-6">
            <ExitSurvey />
          </div>
        </div>
      )}

      <p className="mt-12 text-center text-[15px] text-[var(--text-dim)]">
        <Link href="/inbox" className="underline decoration-[1.5px] underline-offset-4">
          Your chats are still here
        </Link>{" "}
        &mdash; the one that worked is still open.
      </p>
    </div>
  );
}
