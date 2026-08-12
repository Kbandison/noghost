import type { FuseUrgency } from "@noghost/logic";
import { cn } from "@/lib/utils";

/**
 * The fuse ring — spec §7.2: "calm > 72h, amber < 48h, warm-red < 24h; never a
 * panic timer."
 *
 * So it draws hours, not seconds, and it does not animate or tick. The arc
 * shrinks and the colour warms; nothing pulses, counts down live, or turns red
 * to punish you. §3.3 bans manufactured urgency, and a fuse is a real deadline
 * that needs no theatre — the number is alarming enough on its own when it
 * should be.
 *
 * A `date_scheduled` chat gets a calendar chip instead: the fuse is paused, and
 * a ring showing time left would be a lie.
 */

const TONE: Record<FuseUrgency, { stroke: string; text: string }> = {
  calm: { stroke: "var(--sage)", text: "text-[var(--sage-text)]" },
  amber: { stroke: "var(--accent)", text: "text-[var(--accent-text)]" },
  urgent: { stroke: "var(--error)", text: "text-[var(--error)]" },
  paused: { stroke: "var(--border)", text: "text-[var(--text-dim)]" },
  closed: { stroke: "var(--border)", text: "text-[var(--text-dim)]" },
};

/** A full ring is the season's whole seven days. */
const FULL_HOURS = 7 * 24;
const R = 15;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function FuseRing({
  urgency,
  hoursLeft,
  className,
}: {
  urgency: FuseUrgency;
  hoursLeft: number;
  className?: string;
}) {
  const tone = TONE[urgency];
  const fraction = Math.min(Math.max(hoursLeft / FULL_HOURS, 0), 1);
  const label =
    urgency === "closed"
      ? "Closed"
      : urgency === "paused"
        ? "Date on the calendar"
        : `${hoursLeft} hours left`;

  return (
    <span
      className={cn("relative inline-flex h-10 w-10 items-center justify-center", className)}
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle
          cx="18"
          cy="18"
          r={R}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth="2.5"
        />
        {urgency !== "closed" && urgency !== "paused" && (
          <circle
            cx="18"
            cy="18"
            r={R}
            fill="none"
            stroke={tone.stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          />
        )}
      </svg>
      <span className={cn("tabular relative text-[12px] font-medium", tone.text)}>
        {urgency === "closed" ? "—" : urgency === "paused" ? "📅" : hoursLeft}
      </span>
    </span>
  );
}
