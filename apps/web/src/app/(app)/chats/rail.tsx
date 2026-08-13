import Link from "next/link";
import Image from "next/image";
import { EMPTY_STATES } from "@noghost/config/copy";
import { isChatClosed } from "@noghost/types";
import { cn } from "@/lib/utils";
import { publicPhotoUrl } from "@/lib/photos";
import type { ChatSummary } from "@/lib/chats";
import { FuseRing } from "./fuse-ring";

/**
 * The chat list — spec §7.2, sorted by fuse urgency rather than recency.
 *
 * A conversation with nineteen hours left needs attention more than one
 * somebody messaged five minutes ago. Sorting by recency would make the app
 * reward whoever typed last, which is the opposite of what the fuse is for.
 */
export function Rail({ chats, activeId }: { chats: ChatSummary[]; activeId?: string }) {
  const open = chats.filter((chat) => !isChatClosed(chat.state));
  const closed = chats.filter((chat) => isChatClosed(chat.state));

  return (
    <div className="w-full shrink-0 border-[var(--border-subtle)] md:w-[22rem] md:border-r">
      <header className="border-b border-[var(--border-subtle)] px-5 py-4">
        <h1 className="font-[family-name:var(--font-display)] text-[24px] font-extrabold tracking-[-0.03em]">
          Chats
        </h1>
        <p className="mt-1 text-[14px] text-[var(--text-dim)]">
          {open.length === 0
            ? "Nothing open"
            : `${open.length} open · sorted by time left`}
        </p>
      </header>

      {chats.length === 0 ? (
        <p className="px-5 py-12 text-[16px] leading-relaxed text-[var(--text-secondary)]">
          {EMPTY_STATES.chats}
        </p>
      ) : (
        <>
          <ul>
            {open.map((chat) => (
              <Row key={chat.id} chat={chat} active={chat.id === activeId} />
            ))}
          </ul>

          {closed.length > 0 && (
            <section>
              <h2 className="border-y border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-5 py-2 text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
                Closed <span className="opacity-60">{closed.length}</span>
              </h2>
              <ul>
                {closed.map((chat) => (
                  <Row key={chat.id} chat={chat} active={chat.id === activeId} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Row({ chat, active }: { chat: ChatSummary; active: boolean }) {
  const url = chat.partner.photos[0] ? publicPhotoUrl(chat.partner.photos[0].path) : "";
  const preview =
    chat.lastMessage === null
      ? "No messages yet"
      : chat.lastMessage.kind === "system"
        ? "A closing note"
        : chat.lastMessage.kind === "voice"
          ? `${chat.lastMessage.mine ? "You: " : ""}Voice note`
          : `${chat.lastMessage.mine ? "You: " : ""}${chat.lastMessage.body ?? ""}`;

  return (
    <li>
      <Link
        href={`/chats/${chat.id}`}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-3 transition-colors duration-150",
          active ? "bg-[var(--bg-tertiary)]" : "hover:bg-[var(--bg-secondary)]",
        )}
      >
        <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-[var(--bg-tertiary)]">
          {url ? (
            <Image src={url} alt="" fill sizes="48px" className="object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center font-[family-name:var(--font-display)] text-[18px] text-[var(--text-dim)]">
              {chat.partner.firstName.charAt(0)}
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-medium">
            {chat.partner.firstName}
          </span>
          <span className="block truncate text-[14px] text-[var(--text-dim)]">{preview}</span>
        </span>

        {/* §7.2: a date-scheduled chat shows a calendar chip instead of a ring —
            the fuse is paused, so time-left would be a lie. */}
        {chat.scheduledFor && chat.urgency === "paused" ? (
          <span className="shrink-0 rounded-full border border-[var(--sage)] px-2 py-0.5 text-[12px] text-[var(--sage-text)]">
            {new Date(chat.scheduledFor).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        ) : (
          <FuseRing urgency={chat.urgency} hoursLeft={chat.hoursLeft} />
        )}
      </Link>
    </li>
  );
}
