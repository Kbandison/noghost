import type { Metadata } from "next";
import Link from "next/link";
import { GENDER_LABELS } from "@noghost/config";
import { CLAIM_REMINDER_HOURS_LEFT } from "@noghost/logic";
import { cn, Empty, Panel, Stat } from "@/components/ui";
import { statusCounts } from "@/lib/admissions";
import { claimWindows, cohortHealth } from "@/lib/cohort";
import { supabaseServer } from "@/lib/supabase";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const now = new Date().toISOString();
  const supabase = await supabaseServer();

  const { data: season } = await supabase
    .from("seasons")
    .select("id,name,city,phase,starts_at,member_cap,claim_hours,early_bird_cap")
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!season) {
    return (
      <div className="p-8">
        <Panel title="No season">
          <Empty>
            There is no season row yet. Create one before opening applications — every mechanic
            reads its configuration from it.
          </Empty>
        </Panel>
      </div>
    );
  }

  const [counts, health, claims] = await Promise.all([
    statusCounts(),
    cohortHealth(season.id, season.member_cap),
    claimWindows(season.id, now),
  ]);

  const expiringSoon = claims.filter((c) => c.hoursLeft <= 12).length;

  return (
    <div className="mx-auto max-w-[72rem] px-6 py-6">
      <header className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-[26px] font-extrabold tracking-[-0.028em]">
          {season.name}
        </h1>
        <p className="mt-1 text-[13px] text-[var(--text-dim)]">
          {season.city} · {season.phase.replace(/_/g, " ")} · starts{" "}
          {new Date(season.starts_at).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </header>

      <div className="mb-6 grid grid-cols-2 divide-x divide-[var(--border)] border border-[var(--border)] bg-[var(--bg-tertiary)] md:grid-cols-4">
        <Stat
          label="Awaiting review"
          value={counts.under_review ?? 0}
          note={counts.under_review ? "In the queue now" : "Nothing waiting"}
          tone={(counts.under_review ?? 0) > 0 ? "warn" : undefined}
        />
        <Stat
          label="In the cohort"
          value={`${health.members}/${health.cap}`}
          note="Admitted or claimed"
        />
        <Stat
          label="Unclaimed seats"
          value={claims.length}
          note={expiringSoon ? `${expiringSoon} expiring within 12h` : "Claim windows open"}
          tone={expiringSoon > 0 ? "warn" : undefined}
        />
        <Stat label="Rejected" value={counts.rejected ?? 0} note="This season" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Matching balance"
          meta={health.segments.length ? undefined : "nothing to measure yet"}
        >
          {health.segments.length === 0 ? (
            <Empty>No admitted members yet.</Empty>
          ) : (
            <>
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-[0.08em] text-[var(--text-dim)]">
                    <th className="px-4 py-2 text-left font-semibold">Direction</th>
                    <th className="px-2 py-2 text-right font-semibold">Want</th>
                    <th className="px-2 py-2 text-right font-semibold">Available</th>
                    <th className="px-4 py-2 text-right font-semibold">Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {health.segments.map((segment) => (
                    <tr
                      key={`${segment.from}-${segment.to}`}
                      className="border-b border-[var(--border-subtle)]"
                    >
                      <td className="px-4 py-2">
                        {GENDER_LABELS[segment.from]} &rarr; {GENDER_LABELS[segment.to]}
                      </td>
                      <td className="tabular px-2 py-2 text-right">{segment.supply}</td>
                      <td className="tabular px-2 py-2 text-right">{segment.reciprocal}</td>
                      <td
                        className={cn(
                          "tabular px-4 py-2 text-right font-medium",
                          segment.severity === "bad" && "text-[var(--error)]",
                          segment.severity === "watch" && "text-[var(--accent-text)]",
                          segment.severity === "ok" && "text-[var(--sage-text)]",
                        )}
                      >
                        {segment.ratio === Infinity ? "∞" : `${segment.ratio.toFixed(2)}×`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="border-t border-[var(--border)] px-4 py-3 text-[12px] leading-relaxed text-[var(--text-dim)]">
                Matching is mutual, so the smaller side sets the real ceiling. A ratio above 2.5×
                means that direction will run thin — admit against the shorter side before the
                cohort locks.
                {health.dead.length > 0 && (
                  <span className="mt-1 block text-[var(--error)]">
                    {health.dead.length} direction{health.dead.length === 1 ? " has" : "s have"}{" "}
                    nobody on the other side at all.
                  </span>
                )}
              </p>
            </>
          )}
        </Panel>

        <Panel title="Claim windows" meta={`${season.claim_hours}h each`}>
          {claims.length === 0 ? (
            <Empty>No seats waiting to be claimed.</Empty>
          ) : (
            <ul className="max-h-[24rem] overflow-y-auto">
              {claims.map((claim) => (
                <li
                  key={claim.applicationId}
                  className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-2"
                >
                  <Link
                    href={`/admissions/${claim.applicationId}`}
                    className="text-[14px] underline-offset-4 hover:underline"
                  >
                    {claim.firstName}
                  </Link>
                  <span
                    className={cn(
                      "tabular text-[13px]",
                      claim.hoursLeft <= 0
                        ? "text-[var(--error)]"
                        : claim.hoursLeft <= 12
                          ? "text-[var(--accent-text)]"
                          : "text-[var(--text-dim)]",
                    )}
                  >
                    {claim.hoursLeft <= 0 ? "expired" : `${claim.hoursLeft}h left`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-[var(--border)] px-4 py-3 text-[12px] leading-relaxed text-[var(--text-dim)]">
            The <span className="tabular">claim-sweep</span> cron runs hourly: it expires lapsed
            windows, promotes from the waitlist into the seats those release, and texts anyone
            inside their last {CLAIM_REMINDER_HOURS_LEFT} hours once.
          </p>
        </Panel>
      </div>
    </div>
  );
}
