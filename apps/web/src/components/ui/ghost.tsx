import { cn } from "@/lib/utils";

/**
 * The ghost mark — spec §3.2: "friendly, minimal line-art ghost… Playful, never
 * spooky. It is the brand's one joke; don't overuse it."
 *
 * Drawn by hand rather than generated: the curves are deliberately uneven and
 * the bottom wave doesn't repeat. That irregularity is the project's human
 * touch (LUXWEB anti-slop #42 — flawless is now a slop tell).
 *
 * Appears in exactly two places on the marketing site: the hero and the footer.
 */
export function Ghost({
  className,
  title,
}: {
  className?: string;
  /** Omit for decoration; supply when the mark carries meaning on its own. */
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 68 68"
      fill="none"
      className={cn("h-10 w-10", className)}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M12.5 54.5C12 31 19.5 13.5 34 13.5C48.8 13.5 56.2 31.4 55.8 54.2C52.4 50.6 50.1 58.4 45.1 55.2C40.4 52.2 38.6 60.1 33.4 56.3C28.6 52.8 26.2 60.2 21.3 56.1C17.4 52.9 15.4 57.6 12.5 54.5Z"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M26.6 33.4c0 1.3-.9 2.3-2.1 2.3s-2.2-1-2.2-2.3.9-2.4 2.2-2.4 2.1 1.1 2.1 2.4Z"
        fill="currentColor"
      />
      <path
        d="M45.4 33.2c0 1.3-1 2.4-2.2 2.4s-2.1-1.1-2.1-2.4.9-2.3 2.1-2.3 2.2 1 2.2 2.3Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * A marker-style underline for a single headline word. Hand-drawn, one stroke,
 * intentionally overshooting at both ends — the way you'd actually underline
 * something in ink.
 */
export function HandUnderline({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 12"
      fill="none"
      preserveAspectRatio="none"
      className={cn("h-[0.35em] w-full", className)}
      aria-hidden="true"
    >
      <path
        d="M2 8.2C38 5.1 74.5 3.6 111 3.9c39 .3 78 2.1 127 5.4"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
