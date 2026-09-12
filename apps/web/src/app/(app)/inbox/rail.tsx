import Link from "next/link";
import Image from "next/image";
import { EMPTY_STATES } from "@noghost/config/copy";
import { isChatClosed } from "@noghost/types";
import { cn } from "@/lib/utils";
import { publicPhotoUrl } from "@/lib/photos";
import type { Inbox } from "@/lib/inbox";
import type { ChatSummary } from "@/lib/chats";
import { FuseRing } from "../chats/fuse-ring";

/**
 * Everything anybody is saying to you, in one list.
 *
 * ---------------------------------------------------------------------------
 * A deliberate divergence from §7.2
 * ---------------------------------------------------------------------------
 *
 * The spec gives four tabs — Tonight / Inbox / Chats / Profile — and Inbox and
 * Chats were built as two. They are two different objects with two different
 * actions, which is a good reason for two *sections* and turned out to be a
 * poor reason for two tabs: a member with one note waiting and one conversation
 * running had to check two places to find out whether anybody was talking to
 * them, and nothing on either screen said the other existed.
 *
 * So: one tab, four sections, ordered by what it costs you to miss them.
 *
 *   Waiting on you   a note you have not answered      — somebody is waiting
 *   Talking          an open chat, fuse still running  — a clock is running
 *   Your notes       something you sent                — no action
 *   Ended            answered, declined, burnt out     — history
 *
 * The distinction the spec was protecting survives in the rows rather than the
 * navigation. A note carries the prompt they replied to and goes to
 * `/inbox/[id]`, where the actions are Accept and Decline. A chat carries a
 * fuse ring and goes to `/chats/[id]`, where the actions are writing, proposing
 * a date, or closing it kindly. Those screens are untouched — only the way in
 * is shared.
 *
 * Rendered by `/inbox`, `/inbox/[id]` and `/chats/[id]` rather than lifted into
 * a layout, because the active row needs the route params a layout never sees.
 */

function Thumb({
  photos,
  name,
  withheld,
}: {
  photos: { path: string }[];
  name: string;
  withheld?: boolean;
}) {
  const url = photos[0] ? publicPhotoUrl(photos[0].path) : "";
  return (
    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-[var(--bg-tertiary)]">
      {url ? (
        <Image src={url} alt="" fill sizes="48px" className="object-cover" />
      ) : (
        <span className="flex h-full items-center justify-center font-[family-name:var(--font-display)] text-[18px] text-[var(--text-dim)]">
          {/* A withheld partner has no initial to show — a letter here would
              look like the start of somebody's name. */}
          {withheld ? "—" : name.charAt(0)}
        </span>
      )}
    </span>
  );
}

/** Verbatim from the enum, softened only where the word would mislead. */
const OUTCOME: Record<string, string> = {
  pending: "waiting on them",
  accepted: "they said yes",
  declined: "answered",
  expired: "season ended",
};

function chatPreview(chat: ChatSummary): string {
  if (chat.lastMessage === null) return "No messages yet";
  if (chat.lastMessage.kind === "system") return "A closing note";
  const who = chat.lastMessage.mine ? "You: " : "";
  return chat.lastMessage.kind === "voice"
    ? `${who}Voice note`
    : `${who}${chat.lastMessage.body ?? ""}`;
}

export function Rail({
  inbox,
  chats,
  activeId,
}: {
  inbox: Inbox;
  chats: ChatSummary[];
  /** The connect id or chat id currently open, so its row can be marked. */
  activeId?: string;
}) {
  const waiting = inbox.incoming.filter((c) => c.status === "pending");
  /*
   * Accepted notes are left out, and merging the two lists is what made that
   * obvious.
   *
   * Saying yes to a note opens a chat, so an accepted connect and the
   * conversation it became are the same relationship. On two separate screens
   * that was invisible; on one it put the same person in "Talking" with a live
   * fuse and in "Ended" directly underneath, which reads as a conversation that
   * is somehow both running and over.
   *
   * Declined and expired notes stay: those became nothing, so the note is the
   * only record there is, and §5 says every ending carries an answer somebody
   * can go back and read.
   */
  const answered = inbox.incoming.filter(
    (c) => c.status !== "pending" && c.status !== "accepted",
  );
  /*
   * Outgoing notes drop the accepted ones too, for the same reason incoming
   * ones do — and the seed fixtures are what made it visible.
   *
   * A note you sent that somebody said yes to became the conversation you are
   * now having. Listing it under "Your notes" as "they said yes" while that
   * conversation sits in "Talking" puts one person on the screen twice, and the
   * second row is the less useful of the two: it describes something that has
   * already happened next to the thing it turned into.
   */
  const sent = inbox.outgoing.filter((c) => c.status !== "accepted");
  const open = chats.filter((chat) => !isChatClosed(chat.state));
  const closed = chats.filter((chat) => isChatClosed(chat.state));

  const nothingAtAll =
    inbox.incoming.length === 0 && inbox.outgoing.length === 0 && chats.length === 0;

  return (
    <div className="w-full shrink-0 border-[var(--border-subtle)] md:w-[22rem] md:border-r">
      <header className="border-b border-[var(--border-subtle)] px-5 py-4">
        <h1 className="font-[family-name:var(--font-display)] text-[24px] font-extrabold tracking-[-0.03em]">
          Inbox
        </h1>
        {/*
          * The two numbers that mean something, and nothing else.
          *
          * Not a total: "4 items" would blur a note somebody is waiting on with
          * a chat that has six days left, and those need different things from
          * a member at different speeds.
          */}
        <p className="mt-1 text-[14px] text-[var(--text-dim)]">
          {waiting.length === 0 && open.length === 0
            ? "Nothing waiting on you"
            : [
                waiting.length > 0 &&
                  `${waiting.length} ${waiting.length === 1 ? "note" : "notes"} to answer`,
                open.length > 0 && `${open.length} talking`,
              ]
                .filter(Boolean)
                .join(" · ")}
        </p>
      </header>

      {nothingAtAll ? (
        <p className="px-5 py-12 text-[16px] leading-relaxed text-[var(--text-secondary)]">
          {EMPTY_STATES.inbox}
        </p>
      ) : (
        <>
          <Section title="Waiting on you" count={waiting.length}>
            {waiting.map((connect) => (
              <Row
                key={connect.id}
                href={`/inbox/${connect.id}`}
                active={connect.id === activeId}
                photos={connect.from.photos}
                name={connect.from.firstName}
                age={connect.from.age}
                detail={connect.replyText ?? "Voice note"}
                accent
              />
            ))}
            {waiting.length === 0 && (
              <p className="px-5 py-6 text-[15px] text-[var(--text-dim)]">
                You&rsquo;re all caught up.
              </p>
            )}
          </Section>

          {/*
            * Sorted by fuse urgency by `listChats`, not by recency — a
            * conversation with nineteen hours left needs attention more than one
            * somebody messaged five minutes ago, and sorting by recency would
            * make the app reward whoever typed last.
            */}
          {open.length > 0 && (
            <Section title="Talking" count={open.length}>
              {open.map((chat) => (
                <Row
                  key={chat.id}
                  href={`/chats/${chat.id}`}
                  active={chat.id === activeId}
                  photos={chat.partner.photos}
                  name={chat.partner.firstName}
                  withheld={chat.partner.withheld}
                  detail={chatPreview(chat)}
                  trailing={
                    /* §7.2: a date-scheduled chat shows a calendar chip instead
                       of a ring — the fuse is paused, so time-left would lie. */
                    chat.scheduledFor && chat.urgency === "paused" ? (
                      <span className="shrink-0 rounded-full border border-[var(--sage)] px-2 py-0.5 text-[12px] text-[var(--sage-text)]">
                        {new Date(chat.scheduledFor).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    ) : (
                      <FuseRing urgency={chat.urgency} hoursLeft={chat.hoursLeft} />
                    )
                  }
                />
              ))}
            </Section>
          )}

          {sent.length > 0 && (
            <Section title="Your notes" count={sent.length}>
              {sent.map((connect) => (
                <Row
                  key={connect.id}
                  href={`/inbox/${connect.id}`}
                  active={connect.id === activeId}
                  photos={connect.to.photos}
                  name={connect.to.firstName}
                  age={connect.to.age}
                  detail={OUTCOME[connect.status] ?? connect.status}
                />
              ))}
            </Section>
          )}

          {/*
            * One section for both, because a declined note and a burnt-out chat
            * are the same thing to a member reading back: an ending that already
            * happened. §5's promise is that every one of them carries an answer,
            * and both kinds are still openable to read it.
            */}
          {answered.length + closed.length > 0 && (
            <Section title="Ended" count={answered.length + closed.length}>
              {answered.map((connect) => (
                <Row
                  key={connect.id}
                  href={`/inbox/${connect.id}`}
                  active={connect.id === activeId}
                  photos={connect.from.photos}
                  name={connect.from.firstName}
                  age={connect.from.age}
                  detail={connect.status === "expired" ? "The season ended" : "You answered"}
                />
              ))}
              {closed.map((chat) => (
                <Row
                  key={chat.id}
                  href={`/chats/${chat.id}`}
                  active={chat.id === activeId}
                  photos={chat.partner.photos}
                  name={chat.partner.firstName}
                  withheld={chat.partner.withheld}
                  detail={chatPreview(chat)}
                />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="flex items-baseline gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-5 py-2 text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
        {title}
        <span className="opacity-60">{count}</span>
      </h2>
      <ul>{children}</ul>
    </section>
  );
}

/**
 * The two destinations, spelled out because `typedRoutes` is on and will not
 * take a bare string. It is also the clearest statement of what this list is: a
 * note and a chat look alike here and are not the same screen.
 */
type RowHref = `/inbox/${string}` | `/chats/${string}`;

function Row({
  href,
  active,
  photos,
  name,
  age,
  detail,
  accent,
  withheld,
  trailing,
}: {
  href: RowHref;
  active: boolean;
  photos: { path: string }[];
  name: string;
  /** Absent on a chat row: you know how old somebody is by the time you're
      talking, and the ring needs the space more. */
  age?: number;
  detail: string;
  accent?: boolean;
  withheld?: boolean;
  /** The fuse ring or calendar chip, on chat rows only. */
  trailing?: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-3 transition-colors duration-150",
          active ? "bg-[var(--bg-tertiary)]" : "hover:bg-[var(--bg-secondary)]",
        )}
      >
        <Thumb photos={photos} name={name} withheld={withheld} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-medium">
            {name}
            {age !== undefined && (
              <span className="ml-2 font-normal text-[var(--text-dim)]">{age}</span>
            )}
          </span>
          <span
            className={cn(
              "block truncate text-[14px]",
              accent ? "text-[var(--text-secondary)]" : "text-[var(--text-dim)]",
            )}
          >
            {detail}
          </span>
        </span>
        {trailing}
      </Link>
    </li>
  );
}
