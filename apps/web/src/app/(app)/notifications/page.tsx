import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { requireMember } from "@/lib/member";
import { listNotifications } from "@/lib/notifications";
import { MarkNotificationsRead } from "./mark-read";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

/**
 * What this product has sent you.
 *
 * §8 was built with no in-app centre on the grounds that its three `inapp`
 * templates already surface in context. That held until push — a push is the
 * one message here that can be lost outright, and unlike SMS or email it leaves
 * no copy anywhere. This is that copy.
 *
 * Not a second inbox, and deliberately not a place anything is answered: every
 * row links to where the thing actually lives. Nothing here is a task.
 */
export default async function NotificationsPage() {
  await requireMember();
  const entries = await listNotifications();
  const unread = entries.filter((entry) => entry.readAt === null).length;

  return (
    <div className="mx-auto w-full max-w-[38rem] px-6 py-10">
      <MarkNotificationsRead unread={unread} />

      <h1 className="font-[family-name:var(--font-display)] text-[28px] font-extrabold leading-[1.1] tracking-[-0.03em]">
        Notifications
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-secondary)]">
        Everything we&rsquo;ve sent you. Nothing here needs an answer &mdash; it&rsquo;s a
        record, in case a notification came and went before you saw it.
      </p>

      {entries.length === 0 ? (
        <p className="mt-10 border-t border-[var(--border-subtle)] pt-8 text-[16px] leading-relaxed text-[var(--text-secondary)]">
          Nothing yet. When we write to you &mdash; a drop, a reply, a conversation running
          out of time &mdash; it will be here too.
        </p>
      ) : (
        <ul className="mt-8 border-t border-[var(--border-subtle)]">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Link
                href={entry.url as Route}
                className="flex gap-3 border-b border-[var(--border-subtle)] py-4 transition-colors hover:bg-[var(--bg-secondary)]"
              >
                {/*
                  * A dot for unread, and nothing at all once read. Deliberately
                  * not a count anywhere: §3.3 bans engagement bait, and a number
                  * on a log of things that already happened is exactly that. The
                  * Inbox badge counts what needs you; this only remembers.
                  */}
                <span
                  aria-hidden
                  className={
                    entry.readAt === null
                      ? "mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]"
                      : "mt-2 h-2 w-2 shrink-0"
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1 text-[16px] font-medium">
                      {entry.title}
                    </span>
                    <span className="shrink-0 text-[12px] tabular-nums text-[var(--text-dim)]">
                      {new Date(entry.sentAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[15px] leading-relaxed text-[var(--text-secondary)]">
                    {entry.body}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-[14px] leading-relaxed text-[var(--text-dim)]">
        Choose what reaches you in{" "}
        <Link
          href="/profile#notifications"
          className="text-[var(--accent-text)] underline decoration-[1.5px] underline-offset-4"
        >
          notification settings
        </Link>
        .
      </p>
    </div>
  );
}
