"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { worstUrgency, type FuseUrgency } from "@noghost/logic";
import { cn } from "@/lib/utils";
import { InboxIcon, ProfileIcon, TonightIcon } from "./nav-icons";

/**
 * Three tabs, each an icon and a word.
 *
 * §7.2 specifies four — Tonight / Inbox / Chats / Profile — and Inbox and Chats
 * are now one, because a member with a note waiting and a conversation running
 * had to check two places to learn whether anybody was talking to them. The two
 * kinds are still kept apart, in sections inside the list rather than in the
 * navigation. See `inbox/rail.tsx`.
 *
 * ---------------------------------------------------------------------------
 * The active tab is a colour, not a rule
 * ---------------------------------------------------------------------------
 *
 * It used to be a 2px underline beneath the label. A line under one of three
 * words is a small mark to find, and it says nothing until you have worked out
 * which word it belongs to. The whole tab — icon and label together — now takes
 * the accent, which is what the eye lands on first anyway.
 *
 * `aria-current="page"` is what the styling keys off, so the mark a screen
 * reader gets and the mark everybody else gets cannot come apart.
 *
 * ---------------------------------------------------------------------------
 * The Inbox badge stands in for its icon
 * ---------------------------------------------------------------------------
 *
 * With nothing waiting, Inbox is an envelope like the others. The moment
 * something is, the count takes the envelope's place rather than perching on
 * its corner: at this size a badge beside an icon is two small things competing
 * for the space of one, and the number is strictly more informative than the
 * envelope it replaces — you already know which tab it is, the word is written
 * underneath it.
 *
 * **It counts what is new, not what exists.** Notes nobody has answered, plus
 * conversations holding a message this member has not seen. It was the number
 * of open chats, which meant it never went away — five conversations read and
 * answered showed the same "5" as five nobody had opened, and a number that is
 * always lit is a number nobody looks at.
 *
 * Its colour still reads every open chat rather than only the unread ones. The
 * count answers "what is new"; the colour answers "is anything about to go
 * out", and a conversation you have read can still be two hours from closing.
 * Same thresholds as the per-row ring (§7.2 — calm above 72h, amber under 48h,
 * warm-red under 24h), so the tab and the list cannot disagree.
 */

interface Tab {
  href: "/tonight" | "/inbox" | "/profile";
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
}

const TABS: Tab[] = [
  { href: "/tonight", label: "Tonight", Icon: TonightIcon },
  { href: "/inbox", label: "Inbox", Icon: InboxIcon },
  // Never counted. Nothing in settings is ever waiting on you.
  { href: "/profile", label: "Profile", Icon: ProfileIcon },
];

/**
 * `paused` is a `date_scheduled` chat, whose fuse is stopped: it gets the quiet
 * treatment rather than a colour, because a colour would imply a clock that is
 * not running.
 */
const FUSE_BADGE: Record<FuseUrgency, { className: string; says: string }> = {
  urgent: { className: "bg-[var(--error)] text-white", says: "one is close to closing" },
  amber: { className: "bg-[var(--accent)] text-[var(--on-accent)]", says: "one is running low" },
  calm: { className: "bg-[var(--sage)] text-[var(--on-accent)]", says: "all with time left" },
  paused: {
    className: "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]",
    says: "no fuse running",
  },
  closed: {
    className: "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]",
    says: "no fuse running",
  },
};

function Badge({
  n,
  urgency,
  notes,
  size,
}: {
  n: number;
  urgency: FuseUrgency;
  notes: number;
  /** Matches the icon it replaces, so the row's height never shifts. */
  size: string;
}) {
  const tone = FUSE_BADGE[urgency];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums",
        size,
        tone.className,
      )}
      /*
       * The colour is meaningless to a screen reader, so what it means is said
       * in words — and the split is said too, because "4" alone cannot
       * distinguish four people waiting on an answer from four chats ticking.
       */
      aria-label={[
        notes > 0 && `${notes} note${notes === 1 ? "" : "s"} to answer`,
        n - notes > 0 &&
          `${n - notes} conversation${n - notes === 1 ? "" : "s"} with something new`,
        // The colour is about every open chat, not only the unread ones, so it
        // is said as its own clause rather than attached to the count.
        `${tone.says}`,
      ]
        .filter(Boolean)
        .join("; ")}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function AppNav({
  waiting,
  chats,
  chatUrgency,
  layout = "header",
}: {
  /** Notes you have not answered. */
  waiting: number;
  /** Conversations still running. The colour comes from `chatUrgency`. */
  chats: number;
  chatUrgency: FuseUrgency;
  layout?: "header" | "bottom";
}) {
  const pathname = usePathname();
  const total = waiting + chats;

  /*
   * A waiting note forces at least amber.
   *
   * Otherwise a member with two notes and no open chats gets the `paused` grey
   * — the quiet treatment reserved for a stopped clock — on a badge whose whole
   * job is to say somebody is waiting for an answer. Notes have no fuse of
   * their own, so they cannot supply a colour; they can only insist the badge
   * is not silent.
   */
  const urgency = worstUrgency(waiting > 0 ? [chatUrgency, "amber"] : [chatUrgency]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  /** The badge stands in for the icon; with nothing waiting, the icon stands. */
  const mark = (tab: Tab, size: string) =>
    tab.href === "/inbox" && total > 0 ? (
      <Badge n={total} urgency={urgency} notes={waiting} size={size} />
    ) : (
      <tab.Icon className={size} />
    );

  if (layout === "bottom") {
    return (
      <nav
        aria-label="Sections"
        /*
         * `pb-[env(safe-area-inset-bottom)]` rather than a fixed bottom pad. On
         * a phone with a home indicator the last few millimetres of the screen
         * are not tappable, so without this the tabs sit under it and the bar
         * looks like it is falling off the screen.
         */
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--bg-primary)] pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="flex items-stretch">
          {TABS.map((tab) => {
            const active = isActive(tab.href);
            return (
              <li key={tab.href} className="flex-1">
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  // min-h keeps every target comfortably over the 44px anyone
                  // can actually hit with a thumb.
                  className={cn(
                    "flex min-h-[3.5rem] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] transition-colors",
                    active
                      ? "font-semibold text-[var(--accent-text)]"
                      : "text-[var(--text-secondary)]",
                  )}
                >
                  {mark(tab, "h-6 w-6")}
                  <span>{tab.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
      {TABS.map((tab) => {
        const active = isActive(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-[15px] transition-colors duration-150",
              active
                ? "font-semibold text-[var(--accent-text)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            {mark(tab, "h-[18px] w-[18px]")}
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
