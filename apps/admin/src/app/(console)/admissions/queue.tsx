import Link from "next/link";
import Image from "next/image";
import type { ApplicationStatus } from "@noghost/types";
import { cn, Empty, StatusPill } from "@/components/ui";
import { listQueue, statusCounts } from "@/lib/admissions";
import { publicPhotoUrl } from "@/lib/storage";

/**
 * The left half of the Split Canvas.
 *
 * Rendered by both `/admissions` and `/admissions/[id]` rather than lifted
 * into a shared layout, because a layout receives no `searchParams` and the
 * status filter lives there. Re-querying a 200-row window on each navigation
 * is cheaper than the alternatives, and it keeps the filter honest.
 */

const FILTERS: { label: string; value: ApplicationStatus | "all" }[] = [
  { label: "To review", value: "under_review" },
  { label: "Admitted", value: "admitted" },
  { label: "Claimed", value: "claimed" },
  { label: "Waitlisted", value: "waitlisted" },
  { label: "Rejected", value: "rejected" },
  { label: "All", value: "all" },
];

export async function Queue({
  status,
  activeId,
}: {
  status: ApplicationStatus | "all";
  activeId?: string;
}) {
  const [rows, counts] = await Promise.all([listQueue(status), statusCounts()]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="flex h-dvh w-[22rem] shrink-0 flex-col border-r border-[var(--border)]">
      <header className="border-b border-[var(--border)] px-4 py-3">
        <h1 className="font-[family-name:var(--font-display)] text-[18px] font-bold tracking-[-0.02em]">
          Admissions
        </h1>
        <p className="tabular mt-0.5 text-[12px] text-[var(--text-dim)]">
          {counts.under_review ?? 0} awaiting review · {total} total
        </p>
      </header>

      {/* Wraps rather than scrolls. Six filters don't fit the rail's width, and
          a horizontal scroll hides "Rejected" and "All" behind a gesture
          nobody thinks to try — it reads as a clipped row, not a scrollable one. */}
      <div className="flex flex-wrap gap-1 border-b border-[var(--border)] px-2 py-2">
        {FILTERS.map((filter) => {
          const count = filter.value === "all" ? total : (counts[filter.value] ?? 0);
          const active = filter.value === status;
          return (
            <Link
              key={filter.value}
              href={`/admissions?status=${filter.value}`}
              aria-current={active ? "true" : undefined}
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-1 text-[12px] transition-colors duration-150",
                active
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-dim)]",
              )}
            >
              {filter.label}
              <span className="tabular ml-1.5 opacity-70">{count}</span>
            </Link>
          );
        })}
      </div>

      <ol className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 && <Empty>Nothing here.</Empty>}

        {rows.map((row) => {
          const active = row.id === activeId;
          return (
            <li key={row.id}>
              <Link
                href={`/admissions/${row.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 border-b border-[var(--border-subtle)] px-3 py-2.5 transition-colors duration-150",
                  active
                    ? "bg-[var(--bg-tertiary)]"
                    : "hover:bg-[var(--bg-secondary)]",
                )}
              >
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[3px] bg-[var(--bg-secondary)]">
                  {row.photoPath && (
                    <Image
                      src={publicPhotoUrl(row.photoPath)}
                      alt=""
                      fill
                      sizes="44px"
                      className="object-cover"
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">
                    {row.firstName}
                    <span className="tabular ml-1.5 font-normal text-[var(--text-dim)]">
                      {row.age}
                    </span>
                  </p>
                  <p className="truncate text-[12px] text-[var(--text-dim)]">
                    {row.neighborhood ?? "No neighbourhood"}
                  </p>
                </div>

                {/* A missing selfie can't be reviewed — flag it in the list so
                    nobody opens it only to find there's nothing to compare. */}
                {!row.hasSelfie && (
                  <span
                    title="No verification selfie"
                    className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--error)]"
                  >
                    No selfie
                  </span>
                )}
                {status === "all" && <StatusPill status={row.status} />}
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
