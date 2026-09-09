import type { Broadcast } from "@/lib/broadcasts";
import { dismissBroadcast } from "./actions";

/**
 * An announcement from the people running the season.
 *
 * A banner rather than a screen, which is the difference between this and the
 * warning next to it in the layout. A warning has to be acknowledged before the
 * app continues because it is about the member's own conduct; an announcement
 * is information, and information that blocks the product is an interruption
 * pretending to be important.
 *
 * Dismissed by reading it, and gone for good — `read_at` is the record.
 */
export function BroadcastBanner({ broadcasts }: { broadcasts: Broadcast[] }) {
  if (broadcasts.length === 0) return null;

  return (
    <div className="border-b border-[var(--border-subtle)] bg-[var(--sage)]/12">
      {broadcasts.map((broadcast) => (
        <div
          key={broadcast.id}
          className="mx-auto flex w-full max-w-[var(--content-max)] items-start justify-between gap-6 px-6 py-4 md:px-8"
        >
          <div>
            <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--sage-text)]">
              From the team
            </p>
            <p className="mt-1.5 max-w-[52ch] text-[16px] leading-relaxed text-[var(--text-primary)]">
              {broadcast.body}
            </p>
          </div>

          <form action={dismissBroadcast}>
            <input type="hidden" name="id" value={broadcast.id} />
            <button
              type="submit"
              className="shrink-0 text-[15px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
            >
              Got it
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}
