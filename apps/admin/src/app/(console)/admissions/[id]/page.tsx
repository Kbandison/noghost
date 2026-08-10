import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GENDER_LABELS } from "@noghost/config";
import { PROMPT_LIBRARY } from "@noghost/config/copy";
import type { ApplicationStatus } from "@noghost/types";
import { Panel, StatusPill } from "@/components/ui";
import { getApplication } from "@/lib/admissions";
import { publicPhotoUrl, signedSelfieUrl } from "@/lib/storage";
import { Queue } from "../queue";
import { DecisionBar } from "./decision-bar";

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

  const selfieUrl = await signedSelfieUrl(application.selfiePath);
  const decidable = application.status === "under_review";

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
          <Panel
            title="Verification"
            meta={
              application.livenessScore !== null
                ? `liveness ${application.livenessScore.toFixed(2)}`
                : "no liveness score"
            }
            className="mb-6"
          >
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

              <div>
                <div className="grid grid-cols-3 gap-2">
                  {application.photoPaths.map((path, i) => (
                    <div
                      key={path}
                      className="relative aspect-[4/5] overflow-hidden rounded-[3px] border border-[var(--border)] bg-[var(--bg-secondary)]"
                    >
                      <Image
                        src={publicPhotoUrl(path)}
                        alt={`Profile photo ${i + 1}`}
                        fill
                        sizes="(max-width: 768px) 30vw, 150px"
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
                {application.photoPaths.length === 0 && (
                  <p className="text-[13px] text-[var(--error)]">No photos on this profile.</p>
                )}
                <p className="mt-2 text-[12px] text-[var(--text-dim)]">
                  {application.photoPaths.length} photo
                  {application.photoPaths.length === 1 ? "" : "s"} · first one leads their card
                </p>
              </div>
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
        ) : (
          <div className="sticky bottom-0 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-3 text-[13px] text-[var(--text-dim)]">
            Already decided — this application is {application.status.replace(/_/g, " ")}.
            {application.claimDeadline && (
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
