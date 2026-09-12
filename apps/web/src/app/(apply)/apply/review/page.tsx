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

  if (!data) return null;

  /*
   * 0038. Whether the seat has actually been taken, which is a different
   * question from whether it was offered.
   *
   * `memberGate` reads `season_members`, so this is the row that decides
   * whether there is a door to walk through. Before 0038 only the Stripe
   * webhook could write it, and this screen therefore had no way to tell
   * "admitted, seat waiting" from "admitted and in" — it showed the claim
   * block to both, which is how somebody who already had a seat was still
   * being told to buy one.
   */
  const { data: seat } = await supabase
    .from("season_members")
    .select("joined_at,price_paid_cents")
    .eq("user_id", user.id)
    .eq("season_id", data.season_id)
    .maybeSingle();

  return { ...data, seat: seat ?? null };
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
  const seated = Boolean(application?.seat);

  const claim =
    application?.status === "admitted" && !seated
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

  /*
   * The timeline starts where they are, not at the beginning.
   *
   * One hardcoded list served every state, so an admitted applicant read "Now:
   * a person reads your application" underneath a block that had already told
   * them a person read it and said yes, and "If admitted: N hours to buy your
   * pass" underneath the button to buy it. Somebody holding a seat read all of
   * that plus a claim deadline that no longer applied to them.
   *
   * Restating a step somebody has finished is worse than silence: it makes a
   * screen that knows their status look like a screen that doesn't.
   */
  const firstDrop = season
    ? new Date(season.startsAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        timeZone: season.timezone,
      })
    : "Day one";

  const timeline: [string, string][] = seated
    ? [
        [firstDrop, "Your first drop, at 8:00 PM."],
        ["Every night after", "Up to three profiles, once a day."],
        ["Seven days a chat", "Every conversation ends with an answer, never silence."],
      ]
    : claim
      ? [
          ["Now", `Take your seat — ${season?.claimHours ?? 72} hours from your admission.`],
          ["If you don't", "The seat goes to the next person on the waitlist."],
          [firstDrop, "First drop at 8:00 PM."],
        ]
      : [
          ["Now", "A person reads your application."],
          ["Within 5 days", "A decision, either way."],
          [
            "If admitted",
            `${season?.claimHours ?? 72} hours to buy your pass. Then the seat goes to the waitlist.`,
          ],
          [firstDrop, "First drop at 8:00 PM."],
        ];

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
          * 0038. They hold a seat. The only thing this screen owes them now is
          * the way in.
          *
          * Before this, somebody with a seat still saw the claim block telling
          * them what their pass costs and when it expires — a screen asking
          * them to buy the thing they already have. On a deployment without
          * Stripe keys it also said "there's nothing to click", which was the
          * literal truth and a dead end.
          */}
        {seated && (
          <section className="mt-8 border-l-2 border-[var(--accent)] pl-6">
            <h2 className="font-[family-name:var(--font-display)] text-[26px] font-bold tracking-[-0.02em]">
              Your seat is yours.
            </h2>
            <p className="mt-2 text-[17px] leading-relaxed text-[var(--text-secondary)]">
              {application?.seat?.price_paid_cents === 0
                ? "It was given to you, so there's nothing to pay."
                : "Paid and confirmed."}{" "}
              {season
                ? `The first drop is ${new Date(season.startsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: season.timezone })} at 8:00 PM.`
                : "You'll hear from us before the first drop."}
            </p>
            <div className="mt-5">
              <Link
                href="/tonight"
                className="inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-5 py-3 text-[16px] text-[var(--on-accent)] transition-colors hover:bg-[var(--accent-hover)]"
              >
                Go to {season?.name ?? BRAND.SEASON_S1_NAME}
              </Link>
            </div>
          </section>
        )}

        {/*
          * Only for an application still waiting. Rendered unconditionally
          * before, so an admitted applicant read "a person reads it and
          * compares your selfie" directly under "you're in" — two
          * contradictory claims, and for an auto-admit both untrue.
          */}
        {!claim && !seated && (
          <p className="prose-measure mt-7 text-[19px] leading-[1.65] text-[var(--text-secondary)]">
            {`Your application for ${season?.name ?? BRAND.SEASON_S1_NAME} is in. ` +
              "A person on the review team reads it and compares your selfie to your photos. " +
              "You’ll hear back within five days either way — we don’t leave applications " +
              "hanging any more than we leave conversations hanging."}
          </p>
        )}
        {/*
          * Only while the answer is still unknown.
          *
          * "You haven't paid anything, and you won't unless you're admitted"
          * rendered for everybody, so somebody already admitted — with the
          * price, the deadline and the claim button directly above it — was
          * told the terms of a decision that had already gone their way, and
          * somebody already holding a seat was told they had not paid for it.
          */}
        {!claim && !seated && (
          <p className="prose-measure mt-6 text-[17px] leading-[1.7] text-[var(--text-secondary)]">
            {"You haven’t paid anything, and you won’t unless you’re admitted. " +
              `If you are, you’ll get ${season?.claimHours ?? 72} hours to claim your seat.`}
          </p>
        )}

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
            {seated ? "Your season" : "What happens next"}
          </h2>
          <ol className="space-y-6">
            {timeline.map(([when, what]) => (
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
