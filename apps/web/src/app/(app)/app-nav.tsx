"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FuseUrgency } from "@noghost/logic";
import { cn } from "@/lib/utils";

/**
 * §7.2's four tabs.
 *
 * The Inbox count is the number of notes waiting on *you*, not a total. §3.3
 * bans engagement bait, so this is never "3 people like you" — it is a count of
 * answers you owe someone, which is the one number this product is entitled to
 * put in front of a person.
 *
 * ---------------------------------------------------------------------------
 * Two placements, because one row does not fit a phone
 * ---------------------------------------------------------------------------
 *
 * The header used to hold the wordmark, all four tabs, the member's first name
 * and Sign out in a single flex row. That is comfortable from about 700px and
 * broken below it: on a 390px screen the row overflowed, "Profile" was clipped
 * at the edge, and the name and Sign out were pushed off the viewport
 * entirely — so on a phone there was no way to sign out at all.
 *
 * So the tabs render where each size wants them. `header` is the inline row,
 * shown from `md` up. `bottom` is a fixed bar at the foot of the screen below
 * `md`, which is where a thumb is and where every app a member has ever used
 * puts its tabs. The header keeps the wordmark and Sign out at every size.
 */

interface Tab {
  href: "/tonight" | "/inbox" | "/chats" | "/profile";
  label: string;
}

const TABS: Tab[] = [
  { href: "/tonight", label: "Tonight" },
  { href: "/inbox", label: "Inbox" },
  { href: "/chats", label: "Chats" },
  // Never counted. Nothing in settings is ever waiting on you.
  { href: "/profile", label: "Profile" },
];

/**
 * Inbox: answers you owe someone. Always the accent colour, because every one
 * of them is the same kind of thing.
 */
function Count({ n }: { n: number }) {
  return (
    <span
      className="min-w-5 rounded-full bg-[var(--accent)] px-1.5 text-center text-[13px] font-medium leading-5 text-[var(--on-accent)]"
      aria-label={`${n} waiting on you`}
    >
      {n}
    </span>
  );
}

/*
 * Chats: the number is how many are open, the colour is how close the nearest
 * one is to burning. Same thresholds as the per-row fuse ring (§7.2 — calm
 * above 72h, amber under 48h, warm-red under 24h), so the tab and the list can
 * never tell a member different things.
 *
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

function FuseCount({ n, urgency }: { n: number; urgency: FuseUrgency }) {
  const tone = FUSE_BADGE[urgency];
  return (
    <span
      className={cn(
        "min-w-5 rounded-full px-1.5 text-center text-[13px] font-medium leading-5",
        tone.className,
      )}
      // The colour is meaningless to a screen reader, so it is said in words.
      aria-label={`${n} open chat${n === 1 ? "" : "s"}, ${tone.says}`}
    >
      {n}
    </span>
  );
}

export function AppNav({
  waiting,
  chats,
  chatUrgency,
  layout = "header",
}: {
  waiting: number;
  /** Open conversations. The colour comes from `chatUrgency`, not this. */
  chats: number;
  chatUrgency: FuseUrgency;
  layout?: "header" | "bottom";
}) {
  const pathname = usePathname();

  const badgeFor = (href: Tab["href"]) => {
    if (href === "/inbox") return waiting > 0 ? <Count n={waiting} /> : null;
    if (href === "/chats") return chats > 0 ? <FuseCount n={chats} urgency={chatUrgency} /> : null;
    return null;
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  if (layout === "bottom") {
    return (
      <nav
        aria-label="Sections"
        /*
         * `pb-[env(safe-area-inset-bottom)]` rather than a fixed bottom pad.
         * On a phone with a home indicator the last few millimetres of the
         * screen are not tappable, so without this the tabs sit under it and
         * the bar looks like it is falling off the screen.
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
                  // min-h-[3.25rem] keeps every target comfortably over the
                  // 44px anyone can actually hit with a thumb.
                  className={cn(
                    "flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[12px] transition-colors",
                    active
                      ? "font-semibold text-[var(--accent-text)]"
                      : "text-[var(--text-secondary)]",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {tab.label}
                    {badgeFor(tab.href)}
                  </span>
                  {/* The active marker is a rule rather than a background fill:
                      a filled pill this small reads as a button, not a tab. */}
                  <span
                    aria-hidden
                    className={cn(
                      "h-[2px] w-6 rounded-full",
                      active ? "bg-[var(--accent)]" : "bg-transparent",
                    )}
                  />
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
                ? "bg-[var(--bg-tertiary)] font-medium text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            {tab.label}
            {badgeFor(tab.href)}
          </Link>
        );
      })}
    </nav>
  );
}
