import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SYSTEM_CLOSURES, CLOSURE_TEMPLATES, REPORT_REASONS } from "@noghost/config/copy";
import { chatContext, getReport, type ContextMessage, type ReportRow } from "@/lib/reports";
import { Resolve } from "./resolve";

export const metadata: Metadata = { title: "Report" };
export const dynamic = "force-dynamic";

const LABELS = new Map(REPORT_REASONS.map((r) => [r.id as string, r.label]));

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getReport(id);
  if (!report) notFound();

  const context = await chatContext(report);

  return (
    <div className="mx-auto w-full max-w-[52rem] p-8">
      <p className="text-[14px]">
        <Link
          href="/reports"
          className="text-[var(--text-dim)] underline decoration-[1.5px] underline-offset-4"
        >
          ← Reports
        </Link>
      </p>

      <h1 className="mt-4 font-[family-name:var(--font-display)] text-[28px] font-bold tracking-[-0.02em]">
        {LABELS.get(report.reason) ?? report.reason}
      </h1>
      <p className="mt-1 text-[15px] text-[var(--text-secondary)]">
        <strong className="font-semibold">{report.reported.firstName}</strong>, reported by{" "}
        {report.reporter.firstName} on{" "}
        <time dateTime={report.createdAt}>
          {new Date(report.createdAt).toLocaleString("en-US", {
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </time>
      </p>

      <Facts report={report} />

      {report.detail && (
        <section className="mt-8">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
            What {report.reporter.firstName} wrote
          </h2>
          <blockquote className="mt-3 border-l-2 border-[var(--accent)] pl-5 text-[17px] leading-relaxed">
            {report.detail}
          </blockquote>
        </section>
      )}

      <Context report={report} messages={context} />

      <section className="mt-10 border-t border-[var(--border)] pt-8">
        {report.resolution ? (
          <p className="text-[16px] leading-relaxed text-[var(--text-secondary)]">
            Resolved as <strong className="font-semibold">{report.resolution}</strong>
            {report.resolvedAt && (
              <>
                {" "}
                on{" "}
                <time dateTime={report.resolvedAt}>
                  {new Date(report.resolvedAt).toLocaleString("en-US", {
                    month: "long",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
              </>
            )}
            . The reasoning is in the audit trail, not here — this page is the report.
          </p>
        ) : (
          <Resolve id={report.id} name={report.reported.firstName} />
        )}
      </section>
    </div>
  );
}

function Facts({ report }: { report: ReportRow }) {
  const facts: { term: string; value: string; warn?: boolean }[] = [
    {
      term: "Reports against them",
      value: String(report.reportsAgainst),
      warn: report.reportsAgainst > 1,
    },
    { term: "Their account", value: report.reported.status },
    { term: "Reporter's account", value: report.reporter.status },
    { term: "Context", value: report.chatId ? "A chat" : "A profile" },
  ];

  return (
    <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 border-y border-[var(--border-subtle)] py-5 sm:grid-cols-4">
      {facts.map((fact) => (
        <div key={fact.term}>
          <dt className="text-[12px] uppercase tracking-[0.1em] text-[var(--text-dim)]">
            {fact.term}
          </dt>
          <dd
            className={`mt-1 text-[16px] ${fact.warn ? "font-semibold text-[var(--error)]" : ""}`}
          >
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * §7.3's chat context view.
 *
 * Two members' private conversation, opened because one of them asked for help.
 * It is worth being uncomfortable about, so the heading says out loud what is
 * being looked at and the panel exists only when the report names a chat —
 * there is no way to browse from here to any other conversation.
 *
 * Sides are labelled by role rather than by name. The question a moderator is
 * answering is "who said this", and "Reported" / "Reporter" answers it without
 * the reader having to hold two first names in mind while reading something
 * unpleasant.
 */
function Context({ report, messages }: { report: ReportRow; messages: ContextMessage[] }) {
  if (!report.chatId) {
    return (
      <p className="mt-8 text-[15px] leading-relaxed text-[var(--text-dim)]">
        Reported from a profile, so there is no conversation to read.
      </p>
    );
  }

  return (
    <section className="mt-8">
      <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
        Their conversation
      </h2>
      <p className="mt-1 text-[14px] text-[var(--text-dim)]">
        {messages.length === 0
          ? "No messages were sent."
          : `${messages.length} message${messages.length === 1 ? "" : "s"}, oldest first.`}
      </p>

      {messages.length > 0 && (
        <ol className="mt-4 space-y-3 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
          {messages.map((message) => (
            <li key={message.id}>
              <p className="text-[12px] uppercase tracking-[0.1em] text-[var(--text-dim)]">
                {message.from === "system"
                  ? "NoGhost"
                  : message.from === "reported"
                    ? report.reported.firstName
                    : report.reporter.firstName}
                <span className="ml-2 normal-case tracking-normal">
                  <time dateTime={message.createdAt}>
                    {new Date(message.createdAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </span>
              </p>
              <p className="mt-0.5 text-[16px] leading-relaxed">{text(message)}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * A system message stores its template id, not its prose — so the queue has to
 * resolve it the way the member's own screen does, or a moderator reads
 * "removal" where the member read a paragraph.
 *
 * Voice notes are named, not played. Listening to somebody's recorded voice is
 * a further step into their privacy than reading text they typed, and nothing
 * in this queue needs it yet; when a report is *about* a voice note, that wants
 * a deliberate control rather than autoplay in a list.
 */
function text(message: ContextMessage): string {
  if (message.kind === "voice") return "[voice note]";
  const body = message.body ?? "";
  if (message.kind !== "system") return body;

  const template = CLOSURE_TEMPLATES.find((t) => t.id === body);
  const system = SYSTEM_CLOSURES[body as keyof typeof SYSTEM_CLOSURES];
  return template?.body ?? system ?? body;
}
