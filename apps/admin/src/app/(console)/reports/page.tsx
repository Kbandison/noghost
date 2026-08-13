import type { Metadata } from "next";
import Link from "next/link";
import { REPORT_REASONS } from "@noghost/config/copy";
import { listReports, type ReportRow } from "@/lib/reports";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

const LABELS = new Map(REPORT_REASONS.map((reason) => [reason.id as string, reason.label]));
/** A reason id that predates the current list still has to render as something. */
const label = (reason: string) => LABELS.get(reason) ?? reason;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show } = await searchParams;
  const resolved = show === "resolved";
  const reports = await listReports(resolved);
  const open = resolved ? reports.filter((r) => !r.resolution) : reports;

  return (
    <div className="mx-auto w-full max-w-[62rem] p-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-[28px] font-bold tracking-[-0.02em]">
            Reports
          </h1>
          <p className="mt-1 text-[14px] text-[var(--text-dim)]">
            {open.length === 0
              ? "Nothing waiting."
              : `${open.length} waiting · oldest first`}
          </p>
        </div>

        {/*
          Open-only by default. A moderation queue that shows resolved rows by
          default is a list that always looks full, and the number that matters
          is how many people are still waiting to be answered.
        */}
        <nav className="flex gap-4 text-[14px]">
          <Link
            href="/reports"
            aria-current={resolved ? undefined : "page"}
            className="underline decoration-[1.5px] underline-offset-4 aria-[current]:font-semibold aria-[current]:text-[var(--text-primary)]"
          >
            Waiting
          </Link>
          <Link
            href="/reports?show=resolved"
            aria-current={resolved ? "page" : undefined}
            className="underline decoration-[1.5px] underline-offset-4 aria-[current]:font-semibold aria-[current]:text-[var(--text-primary)]"
          >
            Everything
          </Link>
        </nav>
      </header>

      {reports.length === 0 ? (
        <p className="mt-12 text-[15px] leading-relaxed text-[var(--text-dim)]">
          {resolved
            ? "No reports have been filed."
            : "No reports are waiting. Filed reports appear here immediately — the protection is already applied by then, so this queue is about what happens next, not about whether anyone is safe right now."}
        </p>
      ) : (
        <ul className="mt-8 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
          {reports.map((report) => (
            <li key={report.id}>
              <Row report={report} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ report }: { report: ReportRow }) {
  const filed = new Date(report.createdAt);

  return (
    <Link
      href={`/reports/${report.id}`}
      className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-2 py-4 transition-colors hover:bg-[var(--bg-secondary)]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[16px]">
          <strong className="font-semibold">{report.reported.firstName}</strong>
          <span className="text-[var(--text-dim)]"> reported by </span>
          {report.reporter.firstName}
        </span>
        <span className="mt-0.5 block text-[14px] text-[var(--text-secondary)]">
          {label(report.reason)}
          {report.chatId && <span className="text-[var(--text-dim)]"> · from a chat</span>}
        </span>
      </span>

      {/* The number that turns an incident into a pattern. Shown only when it
          is one, so it reads as a flag rather than as a column. */}
      {report.reportsAgainst > 1 && (
        <span className="rounded-full border border-[var(--error)] px-2.5 py-0.5 text-[13px] text-[var(--error)]">
          {report.reportsAgainst} reports
        </span>
      )}

      {report.reported.status === "removed" && (
        <span className="text-[13px] uppercase tracking-[0.1em] text-[var(--text-dim)]">
          removed
        </span>
      )}

      {report.resolution ? (
        <span className="text-[13px] uppercase tracking-[0.1em] text-[var(--text-dim)]">
          {report.resolution}
        </span>
      ) : (
        <time dateTime={report.createdAt} className="text-[13px] text-[var(--text-dim)]">
          {filed.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </time>
      )}
    </Link>
  );
}
