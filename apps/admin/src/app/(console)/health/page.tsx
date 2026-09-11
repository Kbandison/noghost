import type { Metadata } from "next";
import Link from "next/link";
import { Empty, Panel, Stat } from "@/components/ui";
import { cohortReport } from "@/lib/cohort-health";
import { supabaseServer } from "@/lib/supabase";
import { Spark } from "./spark";

export const metadata: Metadata = { title: "Cohort health" };
export const dynamic = "force-dynamic";

/**
 * Cohort health — §7.3, which calls this "the Season Two design input".
 *
 * Written to be read rather than monitored. Nothing here refreshes, nothing
 * alerts, and no number is a target: §11's S+14 checkpoint reads this once to
 * decide whether the drop scoring needs tuning, and §12 decides what Season Two
 * looks like from the same page months later.
 *
 * The honesty rules from `cohort-metrics.ts` surface here as "—" and as broken
 * lines. A rate computed from four connects is noise, and this is the last
 * screen that should hand somebody a confident-looking number.
 */
const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const supabase = await supabaseServer();

  const { data: seasons } = await supabase
    .from("seasons").select("id,name,timezone,starts_at,ends_at")
    .order("starts_at", { ascending: false }).limit(20);

  if (!seasons?.length) {
    return (
      <div className="mx-auto w-full max-w-[62rem] p-8">
        <h1 className="font-[family-name:var(--font-display)] text-[28px] font-bold tracking-[-0.02em]">
          Cohort health
        </h1>
        <Panel className="mt-6"><Empty>There is no season to measure yet.</Empty></Panel>
      </div>
    );
  }

  const season = seasons.find((s) => s.id === params.season) ?? seasons[0]!;
  const today = new Date().toISOString().slice(0, 10);
  // Defaults to the season so far — the window somebody actually wants on
  // opening this, rather than an arbitrary last-30-days.
  const from = params.from ?? season.starts_at.slice(0, 10);
  const to = params.to ?? (season.ends_at.slice(0, 10) < today ? season.ends_at.slice(0, 10) : today);

  const report = await cohortReport(season.id, season.timezone, from, to);
  const totals = report.days.reduce(
    (acc, d) => ({
      drops: acc.drops + d.dropsServed,
      connects: acc.connects + d.connectsSent,
      accepted: acc.accepted + d.connectsAccepted,
      confirmed: acc.confirmed + d.datesConfirmed,
      fuse: acc.fuse + d.closedByFuse,
      user: acc.user + d.closedByUser,
      grads: acc.grads + d.graduations,
    }),
    { drops: 0, connects: 0, accepted: 0, confirmed: 0, fuse: 0, user: 0, grads: 0 },
  );
  const peakDau = Math.max(0, ...report.days.map((d) => d.activeMembers));

  return (
    <div className="mx-auto w-full max-w-[62rem] space-y-8 p-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-[28px] font-bold tracking-[-0.02em]">
            Cohort health
          </h1>
          <p className="mt-1 text-[14px] text-[var(--text-dim)]">
            {season.name} · {from} to {to} · {report.cohortSize} members
          </p>
        </div>
        <div className="flex items-center gap-4 text-[13px]">
          {seasons.length > 1 && (
            <span className="text-[var(--text-dim)]">
              {seasons.filter((s) => s.id !== season.id).map((s) => (
                <Link key={s.id} href={`/health?season=${s.id}`} className="ml-3 underline underline-offset-4">
                  {s.name}
                </Link>
              ))}
            </span>
          )}
          <a
            href={`/health/csv?season=${season.id}&from=${from}&to=${to}`}
            className="rounded-[3px] border border-[var(--border)] px-3 py-1.5 hover:border-[var(--text-dim)]"
          >
            Export CSV
          </a>
        </div>
      </header>

      <Panel title="The season so far" meta={`${report.days.length} days`}>
        <div className="grid grid-cols-2 gap-px bg-[var(--border)] sm:grid-cols-4">
          <Stat label="Drops served" value={totals.drops.toLocaleString()} />
          <Stat label="Notes sent" value={totals.connects.toLocaleString()} />
          <Stat
            label="Accepted"
            value={totals.connects ? pct(totals.accepted / totals.connects) : "—"}
            note={`${totals.accepted} of ${totals.connects}`}
          />
          <Stat label="Dates confirmed" value={totals.confirmed.toLocaleString()} />
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-[var(--border)] bg-[var(--border)] sm:grid-cols-4">
          {/*
            The ratio §7.3 asks for, and the one that says whether the product
            is doing its job. Neither number is failure: a fuse close is the
            mechanic ending a stall, a user close is somebody choosing to end it
            kindly. The balance between them is the signal.
          */}
          <Stat label="Closed by the fuse" value={totals.fuse.toLocaleString()} />
          <Stat label="Closed by a person" value={totals.user.toLocaleString()} />
          <Stat label="Found someone" value={totals.grads.toLocaleString()} />
          <Stat
            label="Peak daily active"
            value={peakDau.toLocaleString()}
            note={report.cohortSize ? pct(peakDau / report.cohortSize) : undefined}
          />
        </div>
      </Panel>

      <Panel title="Chats one member juggles" meta="across the whole window">
        <div className="grid grid-cols-3 gap-px bg-[var(--border)]">
          <Stat label="p50" value={String(report.chatLoad.p50)} />
          <Stat label="p90" value={String(report.chatLoad.p90)} />
          <Stat label="Max" value={String(report.chatLoad.max)} />
        </div>
        <p className="px-4 py-3 text-[12px] leading-relaxed text-[var(--text-dim)]">
          §11&rsquo;s week-two checkpoint reads p90 to decide whether the drop needs tuning. §6.4
          is deliberate that there is no hard slot cap — this is the measurement that would justify
          adding one, and §12 lists it as a Season Two decision.
        </p>
      </Panel>

      <Panel title="Day by day">
        <div className="grid gap-8 p-4 sm:grid-cols-2">
          <Spark rows={report.days} pick={(d) => d.dropsServed} label="Drops served" />
          <Spark rows={report.days} pick={(d) => d.connectRate} label="Connect rate" format={pct} />
          <Spark rows={report.days} pick={(d) => d.acceptRate} label="Accept rate" format={pct} />
          <Spark rows={report.days} pick={(d) => d.chatsOpen} label="Chats open" />
          <Spark rows={report.days} pick={(d) => d.datesConfirmed} label="Dates confirmed" />
          <Spark rows={report.days} pick={(d) => d.activeMembers} label="Daily active" />
        </div>
        {/*
          Stated rather than implied. There is no events table, so "active"
          cannot mean "opened the app" — a member who read their drop and passed
          on all three is invisible here, and somebody using this to shape
          Season Two should know that before they read a trend into it.
        */}
        <p className="border-t border-[var(--border)] px-4 py-3 text-[12px] leading-relaxed text-[var(--text-dim)]">
          &ldquo;Daily active&rdquo; counts members who <em>sent a message</em> that day — the one
          thing the schema durably records. It undercounts anybody who read their drop and passed.
          It is not attendance.
        </p>
      </Panel>
    </div>
  );
}
