import type { DayMetrics } from "@noghost/logic";

/**
 * A chart, drawn as SVG.
 *
 * No charting library. §7.3 asks for charts and what it wants them for is
 * "the Season Two design input" — a shape you can read at a glance, not an
 * interactive dashboard. A library would be 40kB and a set of defaults to fight
 * for something that is a polyline and an axis.
 *
 * Nulls break the line rather than plotting as zero. A rate below the floor was
 * not measured, and a line that dips to the bottom on those days would show a
 * collapse that never happened.
 */
export function Spark({
  rows,
  pick,
  label,
  format = (n: number) => String(Math.round(n)),
}: {
  rows: DayMetrics[];
  pick: (row: DayMetrics) => number | null;
  label: string;
  format?: (n: number) => string;
}) {
  const values = rows.map(pick);
  const present = values.filter((v): v is number => v !== null);
  const max = Math.max(1, ...present);
  const W = 640;
  const H = 90;

  // One segment per unbroken run, so a gap stays a gap.
  const segments: string[] = [];
  let run: string[] = [];
  values.forEach((value, i) => {
    if (value === null) {
      if (run.length > 1) segments.push(run.join(" "));
      run = [];
      return;
    }
    const x = values.length === 1 ? W / 2 : (i / (values.length - 1)) * W;
    const y = H - (value / max) * (H - 8) - 4;
    run.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  if (run.length > 1) segments.push(run.join(" "));

  const last = [...values].reverse().find((v) => v !== null);

  return (
    <figure className="m-0">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--text-dim)]">
          {label}
        </span>
        <span className="tabular text-[15px]">
          {last === undefined || last === null ? "—" : format(last)}
          <span className="ml-2 text-[12px] text-[var(--text-dim)]">
            peak {present.length ? format(max) : "—"}
          </span>
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}: ${present.length} day(s) measured, peak ${present.length ? format(max) : "none"}`}
        className="mt-1.5 h-[70px] w-full"
      >
        {segments.map((points, i) => (
          <polyline
            key={i}
            points={points}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} stroke="var(--border)" strokeWidth="1"
          vectorEffect="non-scaling-stroke" />
      </svg>
      {present.length < values.length && (
        <p className="mt-1 text-[11px] text-[var(--text-dim)]">
          {values.length - present.length} day(s) had too little traffic to measure — the line
          breaks rather than dropping to zero.
        </p>
      )}
    </figure>
  );
}
