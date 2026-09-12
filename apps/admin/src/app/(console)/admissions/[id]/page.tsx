import type { Metadata } from "next";
import { PhotoReview } from "./photo-review";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GENDER_LABELS } from "@noghost/config";
import { PROMPT_LIBRARY } from "@noghost/config/copy";
import type { ApplicationStatus } from "@noghost/types";
import {
  LIVENESS_CONFIDENCE,
  MATCH_SIMILARITY,
  SETTLED_SHARPNESS,
  reviewVerdict,
} from "@noghost/logic";
import { Panel, StatusPill } from "@/components/ui";
import { getApplication } from "@/lib/admissions";
import { signedSelfieUrl } from "@/lib/storage";
import { Queue } from "../queue";
import { DecisionBar } from "./decision-bar";
import { CompBar } from "./comp-bar";

export const metadata: Metadata = { title: "Review application" };
export const dynamic = "force-dynamic";

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--border-subtle)] px-4 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-dim)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-[14px]">{value}</dd>
    </div>
  );
}

/**
 * One measurement, and the line it is being held against.
 *
 * The line is printed because a bare "65/100" invites the reviewer to supply
 * their own idea of what is good. Saying "auto-admits at 85" tells them both
 * where the number sits and that the number below it is a setting rather than a
 * verdict — which is the difference between reading a measurement and reading
 * an accusation.
 */
function Measure({
  label,
  value,
  line,
  raw,
  asks,
  note,
}: {
  label: string;
  value: string | null;
  line: number;
  raw: number | null;
  asks: string;
  /** How the number was arrived at, when that is not obvious. */
  note?: string | null;
}) {
  const under = raw !== null && raw < line;
  return (
    <div className="border-r border-[var(--border-subtle)] px-4 py-3 last:border-r-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-dim)]">
        {label}
      </dt>
      <dd
        className={
          value === null
            ? "mt-1 text-[20px] tabular-nums text-[var(--text-dim)]"
            : under
              ? "mt-1 text-[20px] tabular-nums text-[var(--warning,var(--text-primary))]"
              : "mt-1 text-[20px] tabular-nums text-[var(--sage-text)]"
        }
      >
        {value ?? "not measured"}
      </dd>
      <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-dim)]">
        {asks}
        <br />
        auto-admits at {line}
        {note ? (
          <>
            <br />
            <span className="text-[var(--text-secondary)]">{note}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}

export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { id } = await params;
  const { status } = await searchParams;

  const application = await getApplication(id);
  if (!application) notFound();

  const verdict = reviewVerdict(application);

  const selfieUrl = await signedSelfieUrl(application.selfiePath);
  const decidable = application.status === "under_review";
  // 0038. A comp only makes sense for somebody who has been offered a seat and
  // has not taken one — otherwise the button would either skip a decision or
  // re-grant a seat they already hold.
  const compable = application.status === "admitted" && !application.hasSeat;

  return (
    <div className="flex">
      <Queue status={(status as ApplicationStatus | "all") ?? "under_review"} activeId={id} />

      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-[62rem] px-6 py-6 pb-32">
          <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-[26px] font-extrabold tracking-[-0.028em]">
                {application.firstName}
                <span className="tabular ml-2 text-[var(--text-dim)]">{application.age}</span>
              </h1>
              <p className="mt-1 text-[13px] text-[var(--text-dim)]">
                Applied {new Date(application.createdAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusPill status={application.status} />
              {/* The one question a reviewer asks about an already-decided
                  application: who decided it, and when. */}
              <Link
                href={`/audit?target=${application.id}`}
                className="text-[13px] text-[var(--text-secondary)] underline underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
              >
                History
              </Link>
            </div>
          </header>

          {/*
           * The comparison. This is the decision: does the person in the
           * selfie match the person in the photos?
           *
           * Kept adjacent and at a workable size on purpose — a thumbnail
           * strip would make the reviewer click through and compare from
           * memory, which is exactly how a mismatch gets waved through.
           */}
          <Panel title="Verification" meta={verdict.label} className="mb-6">
            <p
              className={
                verdict.tone === "good"
                  ? "border-b border-[var(--border-subtle)] px-4 py-2.5 text-[13px] leading-relaxed text-[var(--sage-text)]"
                  : verdict.tone === "warn"
                    ? "border-b border-[var(--border-subtle)] px-4 py-2.5 text-[13px] leading-relaxed text-[var(--warning,var(--text-primary))]"
                    : "border-b border-[var(--border-subtle)] px-4 py-2.5 text-[13px] leading-relaxed text-[var(--text-dim)]"
              }
            >
              {verdict.detail}
            </p>

            {/*
             * Both numbers, side by side, with the line each is measured
             * against printed next to it.
             *
             * They were stored and shown to nobody, which made the thresholds
             * unauditable: you cannot tell whether 85 suits your applicants
             * without seeing what real applicants score. AWS declines to
             * recommend a number for exactly that reason. Neither can reject
             * anybody — under the line means this screen, which is where the
             * application was going regardless.
             */}
            <dl className="grid grid-cols-2 border-b border-[var(--border-subtle)]">
              <Measure
                label="Live person"
                value={verdict.liveness}
                line={LIVENESS_CONFIDENCE}
                raw={application.livenessConfidence}
                asks="Was somebody really there?"
                /*
                 * 0037. This is their BEST attempt, not their last, so say so
                 * whenever there was more than one. A reviewer shown the best
                 * of five and not told there were five is being flattered, and
                 * the spread is what separates a camera that needed two goes
                 * from somebody fishing for a number.
                 */
                note={verdict.attempts}
              />
              <Measure
                label="Same person"
                value={verdict.match}
                line={MATCH_SIMILARITY}
                raw={application.livenessScore}
                asks="Are they the one in the photos?"
              />
            </dl>

            {/*
              * 0037. Said only when it is true, because it changes how the
              * number above should be read.
              *
              * A capture filmed while the camera was still focusing produces a
              * liveness score that is evidence about the lens, not about the
              * person. The first one through this system scored 0.0001 with a
              * face that separately matched its own profile photo at 99.99. A
              * reviewer looking at a low number deserves to know which of those
              * two things they are looking at.
              */}
            {application.captureSharpness !== null &&
            application.captureSharpness < SETTLED_SHARPNESS ? (
              <p className="border-b border-[var(--border-subtle)] px-4 py-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                <strong className="font-semibold">Soft capture</strong> &mdash; sharpness{" "}
                <span className="tabular-nums">
                  {application.captureSharpness.toFixed(0)}/100
                </span>
                , under {SETTLED_SHARPNESS}. The camera was still focusing while it filmed, so
                a low liveness number here is as likely to be about the lens as the person.
                They were offered a retake and carried on.
              </p>
            ) : null}

            <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,17rem)_1fr]">
              <figure>
                <div className="relative aspect-[4/5] overflow-hidden rounded-[3px] border border-[var(--border)] bg-[var(--bg-secondary)]">
                  {selfieUrl ? (
                    // Signed URL with a five-minute expiry and a query string,
                    // so it's outside next.config's remotePatterns by design.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selfieUrl}
                      alt="Verification selfie"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-4 text-center text-[13px] text-[var(--error)]">
                      No selfie submitted
                    </div>
                  )}
                </div>
                <figcaption className="mt-2 text-[12px] leading-snug text-[var(--text-dim)]">
                  Verification selfie. Review team only — never shown to another member, and
                  deletable on request.
                </figcaption>
              </figure>

              <PhotoReview userId={application.userId} photos={application.photos} />
            </div>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Applicant">
              <dl>
                <Fact label="Gender" value={GENDER_LABELS[application.gender]} />
                <Fact
                  label="Looking to meet"
                  value={application.seeking.map((g) => GENDER_LABELS[g]).join(", ")}
                />
                <Fact
                  label="Age range"
                  value={
                    <span className="tabular">
                      {application.ageMin}&ndash;{application.ageMax}
                    </span>
                  }
                />
                <Fact label="Neighbourhood" value={application.neighborhood ?? "—"} />
                <Fact label="Occupation" value={application.occupation ?? "—"} />
                <Fact
                  label="Phone"
                  value={
                    <span className="tabular">
                      {application.phone ?? "—"}
                      {application.phoneVerifiedAt && (
                        <span className="ml-2 text-[12px] text-[var(--sage-text)]">verified</span>
                      )}
                    </span>
                  }
                />
                <Fact
                  label="Date of birth"
                  value={<span className="tabular">{application.birthdate}</span>}
                />
              </dl>
            </Panel>

            <Panel title="In their words">
              <div className="space-y-4 p-4">
                {application.prompts.map((prompt) => {
                  const text =
                    PROMPT_LIBRARY.find((p) => p.id === prompt.prompt_id)?.text ?? prompt.prompt_id;
                  return (
                    <div key={prompt.prompt_id}>
                      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-dim)]">
                        {text}
                      </p>
                      <p className="mt-1 text-[15px] leading-relaxed">{prompt.answer}</p>
                    </div>
                  );
                })}
                {application.prompts.length === 0 && (
                  <p className="text-[13px] text-[var(--error)]">No prompts answered.</p>
                )}
              </div>

              <div className="border-t border-[var(--border)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-dim)]">
                  Interests
                </p>
                <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--text-secondary)]">
                  {application.interests.join(" · ") || "—"}
                </p>
              </div>
            </Panel>
          </div>
        </div>

        {decidable ? (
          <DecisionBar id={application.id} name={application.firstName} />
        ) : compable ? (
          /*
           * 0038. Admitted, no seat taken. Until 0038 the Stripe webhook was
           * the only thing that could write `season_members`, so on a
           * deployment without Stripe keys this state was terminal: the
           * applicant's screen said their seat was held and gave them nothing
           * to press, and no amount of waiting changed it.
           */
          <CompBar
            id={application.id}
            name={application.firstName}
            priceCents={application.seatPaidCents}
          />
        ) : (
          <div className="sticky bottom-0 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-3 text-[13px] text-[var(--text-dim)]">
            Already decided — this application is {application.status.replace(/_/g, " ")}.
            {application.hasSeat && (
              <>
                {" "}
                {application.seatComped
                  ? `Seat comped${application.seatCompReason ? ` — ${application.seatCompReason}` : ""}.`
                  : `Seat paid, $${((application.seatPaidCents ?? 0) / 100).toFixed(0)}.`}
              </>
            )}
            {application.claimDeadline && !application.hasSeat && (
              <>
                {" "}Claim window closes{" "}
                <span className="tabular">
                  {new Date(application.claimDeadline).toLocaleString("en-US")}
                </span>
                .
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
