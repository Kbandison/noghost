import Link from "next/link";
import Image from "next/image";
import { answerWindow } from "@noghost/logic";
import { publicPhotoUrl } from "@/lib/photos";
import type { IncomingConnect } from "@/lib/inbox";

/**
 * The notes waiting on you, as faces rather than rows.
 *
 * These are the only things on this screen that somebody is owed an answer to,
 * and as list rows they looked exactly like the nine conversations below them.
 * A face is a person; a row is an item. The section that matters most should
 * not be the one that reads most like an inbox.
 *
 * ---------------------------------------------------------------------------
 * What the ring means, and what it does not
 * ---------------------------------------------------------------------------
 *
 * It is the 72-hour answer window from §6.2, drawn with the same palette as the
 * fuse ring so one page speaks one language about time.
 *
 * **It is not a countdown to the note disappearing.** A pending connect lives
 * until the season ends. What happens at the end of this window is that the
 * person who wrote to you gets their one nudge — so the ring is "how long
 * before they are told you haven't answered", which is a real deadline with a
 * real consequence for somebody else, and the only per-note clock the product
 * has. `answerWindow` carries the same warning.
 */

const R = 26;
const C = 2 * Math.PI * R;

const STROKE: Record<"calm" | "amber" | "urgent", string> = {
  calm: "var(--sage)",
  amber: "var(--accent)",
  urgent: "var(--error)",
};

export function WaitingBubbles({
  connects,
  now,
  activeId,
}: {
  connects: IncomingConnect[];
  /** Passed in so the ring and the rest of the page agree on the moment. */
  now: string;
  activeId?: string;
}) {
  if (connects.length === 0) {
    return (
      <p className="px-5 py-6 text-[15px] text-[var(--text-dim)]">You&rsquo;re all caught up.</p>
    );
  }

  return (
    /*
     * Wraps rather than scrolls sideways. A horizontal strip hides the fourth
     * face behind a gesture, and these are the things a member most needs to
     * see all of — three unanswered notes must not look like two.
     */
    <ul className="flex flex-wrap gap-x-5 gap-y-4 px-5 py-5">
      {connects.map((connect) => {
        const window_ = answerWindow(connect.createdAt, now);
        const url = connect.from.photos[0]
          ? publicPhotoUrl(connect.from.photos[0].path)
          : "";
        const active = connect.id === activeId;

        return (
          <li key={connect.id}>
            <Link
              href={`/inbox/${connect.id}`}
              aria-current={active ? "page" : undefined}
              className="group flex w-[4.5rem] flex-col items-center gap-1.5 text-center"
            >
              <span className="relative block h-[3.75rem] w-[3.75rem]">
                {/* The ring sits outside the photo rather than over it, so a
                    face is never tinted by how late somebody is. */}
                <svg
                  viewBox="0 0 60 60"
                  aria-hidden
                  className="absolute inset-0 h-full w-full -rotate-90"
                >
                  <circle
                    cx="30"
                    cy="30"
                    r={R}
                    fill="none"
                    stroke="var(--border)"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx="30"
                    cy="30"
                    r={R}
                    fill="none"
                    stroke={STROKE[window_.tone]}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={C}
                    strokeDashoffset={C * (1 - window_.remaining)}
                  />
                </svg>
                <span className="absolute inset-[6px] overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                  {url ? (
                    <Image
                      src={url}
                      alt=""
                      fill
                      sizes="60px"
                      className="object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center font-[family-name:var(--font-display)] text-[20px] text-[var(--text-dim)]">
                      {connect.from.firstName.charAt(0)}
                    </span>
                  )}
                </span>
              </span>

              <span className="block w-full truncate text-[13px] font-medium">
                {connect.from.firstName}
              </span>
              {/*
                * Said in words as well as drawn, because a ring is unreadable
                * to a screen reader and approximate to everybody else.
                */}
              <span className="block text-[11px] leading-tight text-[var(--text-dim)]">
                {window_.left > 0
                  ? `${Math.ceil(window_.left)}h to reply`
                  : "they're waiting"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
