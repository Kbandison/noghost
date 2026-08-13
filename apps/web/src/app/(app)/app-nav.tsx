"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * §7.2's four tabs.
 *
 * The Inbox count is the number of notes waiting on *you*, not a total. §3.3
 * bans engagement bait, so this is never "3 people like you" — it is a count of
 * answers you owe someone, which is the one number this product is entitled to
 * put in front of a person.
 */
export function AppNav({ waiting, chats }: { waiting: number; chats: number }) {
  const pathname = usePathname();

  const tabs = [
    { href: "/tonight" as const, label: "Tonight" },
    { href: "/inbox" as const, label: "Inbox", count: waiting },
    // No count: an open chat is not a task you owe someone, and a badge would
    // turn the fuse into a nag. The ring inside the list carries the urgency.
    { href: "/chats" as const, label: "Chats", count: 0, muted: chats === 0 },
    // Last, and never counted. Nothing in settings is ever waiting on you.
    { href: "/profile" as const, label: "Profile" },
  ];

  return (
    <nav aria-label="Sections" className="flex items-center gap-1">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
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
            {tab.count ? (
              <span
                className="min-w-5 rounded-full bg-[var(--accent)] px-1.5 text-center text-[13px] font-medium text-[var(--on-accent)]"
                aria-label={`${tab.count} waiting on you`}
              >
                {tab.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
