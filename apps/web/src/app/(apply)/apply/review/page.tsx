import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BRAND } from "@noghost/config";
import { usingSeedData } from "@noghost/config/env";
import { getPublicSeasonStats } from "@noghost/db";
import { isSubmittable } from "@noghost/logic";
import { Ghost } from "@/components/ui/ghost";
import { readDraft } from "@/lib/application-draft";
import { supabaseServer } from "@/lib/supabase";
import { claimContext } from "@/lib/claim";
import { stripeConfigured } from "@/lib/stripe";
import { ClaimSeat } from "./claim";

export const metadata: Metadata = {
  title: "Application received",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The under-review state — spec §7.2, the last screen of onboarding.
 *
 * ⚠️ Copy authored, not transcribed. §9.5.1 gives the *email* for this moment
 * ("Application received", decision within five days, reply-to is a human);
 * the in-app screen isn't in §9. Written to match that email so the two don't
 * contradict each other. Flagged for sign-off.
 */
/**
 * The application actually on file, if there is one.
 *
 * Read through the member's own session, so RLS is what scopes it — this can
 * only ever return the caller's row.
 */
async function filedApplication() {
  if (usingSeedData()) return null;

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("applications")
    .select("id,status,created_at,season_id,claim_deadline")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

export default async function ReviewPage() {
  const draft = await readDraft();
  const [season, application] = await Promise.all([getPublicSeasonStats(), filedApplication()]);

  // Landing here without a finished application means something went wrong or
  // someone typed the URL. Send them back to where they actually are.
  //
  // A filed application outranks the cookie: the draft is only the carrier,
  // and someone returning on a cleared cookie should still see their status.
  if (!application && !isSubmittable(draft, new Date().toISOString())) redirect("/apply/start");

  /*
   * An admitted application has a seat waiting and, until now, no way to take
   * it — this screen has been telling people they would get N hours to claim
   * one since the funnel shipped. Priced from `season_members`, which is the
   * same count the checkout session charges against.
   */
  const claim =
    application?.status === "admitted"
      ? await claimContext(application.season_id, application.claim_deadline)
      : null;

  /*
   * Which door they came through.
   *
   * Since 0031 an application can be admitted by a person reading it or by the
   * automated identity check. This page told everybody the same thing, phrased
   * as fact — "a person read your application and said yes" — which for an
   * auto-admitted applicant describes a review that never happened. Worse, the
   * paragraph promising a human reviewer rendered *alongside* the admitted
   * block, so that person was told it twice.
   *
   * Nothing here reveals a score or a shortfall. The outcome of an application
   * is not a secret — an admitted member gets an email, an SMS and a claim
   * deadline within seconds of this — and knowing how it was reached adds
   * nothing an attacker could use, because they are already through.
   */
  const { data: route } = await (await supabaseServer()).rpc("my_application_route");
  const admittedAutomatically = route?.[0]?.admitted_automatically ?? false;

  return (
    <div className="mx-auto grid w-full max-w-[var(--content-max)] grid-cols-1 gap-12 px-6 pb-24 pt-16 md:px-8 lg:grid-cols-12 lg:gap-16 lg:pt-24">
      <div className="lg:col-span-7">
        <Ghost className="mb-8 h-12 w-12 text-[var(--accent)]" />
        <h1 className="font-[family-name:var(--font-display)] text-[clamp(2.25rem,5vw,3.5rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
          That&rsquo;s everything, {draft.firstName}.
        </h1>
        {/*
         * Built as one expression rather than JSX text around `{...}`.
         * A multi-line text node that follows an interpolation loses its
         * leading space in this toolchain — it rendered "Season Oneis in".
         */}
        {claim && (
          <section className="mt-8 border-l-2 border-[var(--accent)] pl-6">
            <h2 className="font-[family-name:var(--font-display)] text-[26px] font-bold tracking-[-0.02em]">
              You&rsquo;re in.
            </h2>
            <p className="mt-2 text-[17px] leading-relaxed text-[var(--text-secondary)]">
              {admittedAutomatically
                ? "Your identity check cleared and your photos came back clean, so you " +
                  "didn’t have to wait for anybody."
                : "A person read your application and said yes."}
            </p>
            <div className="mt-5">
              <ClaimSeat
                cents={claim.quote.cents}
                tier={claim.quote.tier}
                earlyBirdRemaining={claim.quote.earlyBirdRemaining}
                deadline={claim.claimDeadline}
                seasonName={claim.seasonName}
                available={stripeConfigured()}
              />
            </div>
          </section>
        )}

        {/*
          * Only for an application still waiting. Rendered unconditionally
          * before, so an admitted applicant read "a person reads it and
          * compares your selfie" directly under "you're in" — two
          * contradictory claims, and for an auto-admit both untrue.
          */}
        {!claim && (
          <p className="prose-measure mt-7 text-[19px] leading-[1.65] text-[var(--text-secondary)]">
            {`Your application for ${season?.name ?? BRAND.SEASON_S1_NAME} is in. ` +
              "A person on the review team reads it and compares your selfie to your photos. " +
              "You’ll hear back within five days either way — we don’t leave applications " +
              "hanging any more than we leave conversations hanging."}
          </p>
        )}
        <p className="prose-measure mt-6 text-[17px] leading-[1.7] text-[var(--text-secondary)]">
          {"You haven’t paid anything, and you won’t unless you’re admitted. " +
            `If you are, you’ll get ${season?.claimHours ?? 72} hours to claim your seat.`}
        </p>

        {usingSeedData() && (
          <p className="mt-8 border-l-2 border-[var(--accent)] pl-4 text-[15px] leading-relaxed text-[var(--text-dim)]">
            Running on seed data, so no application was actually filed and no SMS was sent.
            Everything you entered lives in a cookie on this device.
          </p>
        )}

        <div className="mt-12 flex flex-wrap items-center gap-6">
          <Link
            href="/"
            className="text-[16px] text-[var(--accent-text)] underline decoration-[1.5px] underline-offset-4 transition-all hover:decoration-[2.5px]"
          >
            Back to the start
          </Link>
          <a
            href={`mailto:${BRAND.SUPPORT_EMAIL}`}
            className="text-[16px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
          >
            {BRAND.SUPPORT_EMAIL}
          </a>
        </div>
      </div>

      <aside className="lg:col-span-5 lg:pl-8">
        <div className="border-l-2 border-[var(--border)] pl-6 md:pl-8">
          <h2 className="mb-6 text-[13px] font-medium uppercase tracking-[0.14em] text-[var(--text-dim)]">
            What happens next
          </h2>
          <ol className="space-y-6">
            {[
              ["Now", "A person reads your application."],
              ["Within 5 days", "A decision, either way."],
              [
                "If admitted",
                `${season?.claimHours ?? 72} hours to buy your pass. Then the seat goes to the waitlist.`,
              ],
              [
                season ? new Date(season.startsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: season.timezone }) : "Day one",
                "First drop at 8:00 PM.",
              ],
            ].map(([when, what]) => (
              <li key={when}>
                <p className="font-[family-name:var(--font-display)] text-[18px] font-semibold tracking-[-0.012em]">
                  {when}
                </p>
                <p className="mt-1 text-[16px] leading-relaxed text-[var(--text-secondary)]">
                  {what}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}
