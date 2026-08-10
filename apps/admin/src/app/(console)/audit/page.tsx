import { Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { cn, Empty, Panel, StatusPill } from "@/components/ui";
import {
  AUDIT_PAGE_SIZE,
  actionLabel,
  auditActorOptions,
  listAudit,
  targetHref,
  type AuditActor,
  type AuditRow,
} from "@/lib/audit";
import { supabaseServer } from "@/lib/supabase";

export const metadata: Metadata = { title: "Audit trail" };
export const dynamic = "force-dynamic";

/**
 * The audit trail — spec §7.3.
 *
 * Read-only, and structurally so: `admin_audit` has no client insert, update or
 * delete policy, so there is nothing here to edit and no action that could.
 *
 * Times render in the *season's* timezone, not the server's. Rendered on the
 * server, `toLocaleString` with no zone uses whatever the host is set to —
 * UTC on Vercel — so a decision made at 2pm in the season's city reads as 9pm
 * to the reviewer who made it. On a page whose entire content is "when did this
 * happen", that is not a cosmetic problem, so the zone is explicit and labelled.
 */

function hrefFor(params: {
  actor?: string;
  target?: string;
  before?: string;
}): "/audit" | `/audit?${string}` {
  const query = new URLSearchParams();
  if (params.actor) query.set("actor", params.actor);
  if (params.target) query.set("target", params.target);
  if (params.before) query.set("before", params.before);
  const search = query.toString();
  return search ? `/audit?${search}` : "/audit";
}

/** `{from: 'under_review', to: 'admitted'}` is the story of an admissions row. */
function Change({ row }: { row: AuditRow }) {
  const { from, to } = row.detail as { from?: unknown; to?: unknown };

  if (typeof from === "string" && typeof to === "string") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <StatusPill status={from} />
        {/* The arrow carries the meaning visually and nothing in speech, so it
            is hidden and the words sit between the two pills — read aloud in
            DOM order this says "waitlisted changed to admitted". Placed after
            both pills it said "waitlisted admitted changed to". */}
        <span aria-hidden className="text-[var(--text-dim)]">
          &rarr;
        </span>
        <span className="sr-only">changed to</span>
        <StatusPill status={to} />
      </span>
    );
  }

  const entries = Object.entries(row.detail);
  if (entries.length === 0) return <span className="text-[var(--text-dim)]">&mdash;</span>;

  // Anything the labels above don't know about still has to be readable. A new
  // RPC's audit detail should show up here the day it ships, not the day
  // somebody remembers to add a case for it.
  return (
    <span className="text-[13px] text-[var(--text-secondary)]">
      {entries.map(([key, value]) => (
        <span key={key} className="mr-2.5 inline-block">
          <span className="text-[var(--text-dim)]">{key.replace(/_/g, " ")} </span>
          <span className="tabular">
            {typeof value === "string" || typeof value === "number" || typeof value === "boolean"
              ? String(value)
              : JSON.stringify(value)}
          </span>
        </span>
      ))}
    </span>
  );
}

function Actor({ actor }: { actor: AuditActor }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span
        className={cn(
          "truncate",
          actor.kind === "system" && "text-[var(--text-dim)]",
          actor.kind === "unknown" && "tabular text-[var(--text-dim)]",
        )}
        title={actor.kind === "unknown" ? actor.id : undefined}
      >
        {actor.label}
      </span>
      {actor.kind === "system" && (
        <span className="text-[11px] uppercase tracking-[0.06em] text-[var(--text-dim)]">cron</span>
      )}
      {/* grant-admin.ts deactivates rather than deletes, precisely so this
          still resolves to a name. Saying so keeps the trail honest about
          who currently holds access. */}
      {actor.revoked && (
        <span className="text-[11px] uppercase tracking-[0.06em] text-[var(--text-dim)]">
          revoked
        </span>
      )}
    </span>
  );
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ actor?: string; target?: string; before?: string }>;
}) {
  const { actor, target, before } = await searchParams;

  const supabase = await supabaseServer();
  const [{ data: season }, page, actors] = await Promise.all([
    supabase
      .from("seasons")
      .select("timezone")
      .order("starts_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    listAudit({ actor, target, before }),
    auditActorOptions(),
  ]);

  const timeZone = season?.timezone ?? "UTC";
  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
  const clock = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone,
  });
  const zoneLabel =
    new Intl.DateTimeFormat("en-US", { timeZoneName: "short", timeZone })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value ?? timeZone;

  const filtered = Boolean(actor || target);

  return (
    <div className="mx-auto max-w-[76rem] px-6 py-6">
      <header className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-[26px] font-extrabold tracking-[-0.028em]">
          Audit trail
        </h1>
        <p className="mt-1 max-w-[46rem] text-[13px] leading-relaxed text-[var(--text-dim)]">
          Every state change written by a privileged function, newest first. Append-only &mdash;
          nothing here can be edited or removed, including by an admin. Times are{" "}
          <span className="tabular">{zoneLabel}</span>, the season&rsquo;s timezone.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-1">
        <Link
          href={hrefFor({ target })}
          aria-current={!actor ? "true" : undefined}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[12px] transition-colors duration-150",
            !actor
              ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]"
              : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-dim)]",
          )}
        >
          Everyone
        </Link>

        {actors.map((option) => {
          const active = option.id === actor;
          return (
            <Link
              key={option.id}
              href={hrefFor({ actor: option.id, target })}
              aria-current={active ? "true" : undefined}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[12px] transition-colors duration-150",
                active
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-dim)]",
              )}
            >
              {option.label}
              {option.revoked && <span className="ml-1.5 opacity-70">revoked</span>}
            </Link>
          );
        })}

        {target && (
          <Link
            href={hrefFor({ actor })}
            className="ml-2 rounded-full border border-[var(--border)] px-2.5 py-1 text-[12px] text-[var(--text-secondary)] transition-colors duration-150 hover:border-[var(--text-dim)]"
          >
            Showing one record &mdash; clear
          </Link>
        )}
      </div>

      <Panel
        title="Entries"
        meta={`${page.total} matching${page.rows.length < page.total ? ` · showing ${page.rows.length}` : ""}`}
      >
        {page.rows.length === 0 ? (
          <Empty>
            {filtered
              ? "No entries match this filter."
              : "Nothing recorded yet. Entries appear here the moment a privileged function runs."}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-[0.08em] text-[var(--text-dim)]">
                  <th scope="col" className="px-4 py-2 text-left font-semibold">
                    Time
                  </th>
                  <th scope="col" className="px-2 py-2 text-left font-semibold">
                    Who
                  </th>
                  <th scope="col" className="px-2 py-2 text-left font-semibold">
                    Action
                  </th>
                  <th scope="col" className="px-2 py-2 text-left font-semibold">
                    Change
                  </th>
                  <th scope="col" className="px-4 py-2 text-left font-semibold">
                    Record
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((row, index) => {
                  const when = new Date(row.createdAt);
                  const dayLabel = day.format(when);
                  const previous = page.rows[index - 1];
                  const newDay = !previous || dayLabel !== day.format(new Date(previous.createdAt));
                  const href = targetHref(row);

                  return (
                    <Fragment key={row.id}>
                      {newDay && (
                        <tr className="bg-[var(--bg-secondary)]">
                          <th
                            scope="colgroup"
                            colSpan={5}
                            className="border-y border-[var(--border)] px-4 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-dim)]"
                          >
                            {dayLabel}
                          </th>
                        </tr>
                      )}
                      <tr className="border-b border-[var(--border-subtle)]">
                        <td className="tabular whitespace-nowrap px-4 py-2 text-[13px] text-[var(--text-secondary)]">
                          <time dateTime={row.createdAt}>{clock.format(when)}</time>
                        </td>
                        <td className="max-w-[16rem] px-2 py-2">
                          <Actor actor={row.actor} />
                        </td>
                        <td className="whitespace-nowrap px-2 py-2">
                          {actionLabel(row.action, row.detail)}
                        </td>
                        <td className="px-2 py-2">
                          <Change row={row} />
                        </td>
                        <td className="px-4 py-2">
                          {!row.targetId ? (
                            <span className="text-[var(--text-dim)]">&mdash;</span>
                          ) : href ? (
                            <Link
                              href={href}
                              className="tabular text-[13px] underline-offset-4 hover:underline"
                            >
                              {row.targetId.slice(0, 8)}&hellip;
                            </Link>
                          ) : (
                            <span
                              className="tabular text-[13px] text-[var(--text-dim)]"
                              title={`${row.targetTable ?? "unknown table"} ${row.targetId}`}
                            >
                              {row.targetId.slice(0, 8)}&hellip;
                              {/* Says which of the two reasons there is no link:
                                  the row is gone, or that table has no console
                                  view yet (chats, until Phase 4). */}
                              <span className="ml-1.5 text-[11px] uppercase tracking-[0.06em]">
                                {row.targetTable === "applications"
                                  ? "deleted"
                                  : (row.targetTable ?? "unknown")}
                              </span>
                            </span>
                          )}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {(page.nextCursor || before) && (
          <div className="flex items-center justify-between gap-4 border-t border-[var(--border)] px-4 py-3 text-[13px]">
            <span className="text-[var(--text-dim)]">
              {before ? `Older than the first ${AUDIT_PAGE_SIZE}` : `Newest ${AUDIT_PAGE_SIZE}`}
            </span>
            <span className="flex gap-4">
              {before && (
                <Link
                  href={hrefFor({ actor, target })}
                  className="text-[var(--text-secondary)] underline underline-offset-4 hover:text-[var(--text-primary)]"
                >
                  Back to newest
                </Link>
              )}
              {page.nextCursor && (
                <Link
                  href={hrefFor({ actor, target, before: page.nextCursor })}
                  className="text-[var(--text-secondary)] underline underline-offset-4 hover:text-[var(--text-primary)]"
                >
                  Older &rarr;
                </Link>
              )}
            </span>
          </div>
        )}
      </Panel>
    </div>
  );
}
