import Link from "next/link";
import Image from "next/image";
import { EMPTY_STATES } from "@noghost/config/copy";
import { isChatClosed } from "@noghost/types";
import { cn } from "@/lib/utils";
import { publicPhotoUrl } from "@/lib/photos";
import type { Inbox } from "@/lib/inbox";
import type { ChatSummary } from "@/lib/chats";
import { FuseRing } from "../chats/fuse-ring";
import { Section } from "./sections";
import { WaitingBubbles } from "./waiting-bubbles";

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
 * poor reason for two tabs: a member with a note waiting and a conversation
 * running had to check two places to find out whether anybody was talking to
 * them, and nothing on either screen said the other existed.
 *
 * Three sections now, each foldable and each remembering how it was left:
 *
 *   Waiting on you  notes nobody has answered — faces with an answer-window
 *                   ring, open by default, because it is the only section
 *                   somebody is owed something from
 *   Conversations   open chats AND notes you sent — both are "something you
 *                   started that is still going", and keeping them apart meant
 *                   scrolling past your own sent notes to reach a reply
 *   Ended           answered, declined, burnt out — history, folded away
 *
 * There is no header. A screen reached by pressing "Inbox" does not need to be
 * titled "Inbox", and the counts that lived there now sit on the section
 * headings, where each one belongs to something.
 *
 * A row opens in a dialog over this list rather than under it — see
 * `@modal/(.)inbox` — so answering a note never loses your place.
 */

/** Verbatim from the enum, softened only where the word would mislead. */
const OUTCOME: Record<string, string> = {
  pending: "waiting on them",
  declined: "they answered",
  expired: "the season ended",
};

function chatPreview(chat: ChatSummary): string {
  if (chat.lastMessage === null) return "No messages yet";
  if (chat.lastMessage.kind === "system") return "A closing note";
  const who = chat.lastMessage.mine ? "You: " : "";
  return chat.lastMessage.kind === "voice"
    ? `${who}Voice note`
    : `${who}${chat.lastMessage.body ?? ""}`;
}

/**
 * When, in as few characters as carry the meaning.
 *
 * Replaces the age that used to sit beside every name. An age is a fact about
 * somebody you have already decided to talk to; "when did they last say
 * something" is what a list of conversations is for, and it was the one thing
 * this list did not show.
 */
function when(iso: string, now: string): string {
  const then = new Date(iso);
  const minutes = (Date.parse(now) - then.getTime()) / 60_000;
  if (minutes < 1) return "now";
  if (minutes < 60) return `${Math.floor(minutes)}m`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 60 * 24 * 7) return `${Math.floor(minutes / (60 * 24))}d`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function Rail({
  inbox,
  chats,
  now,
  activeId,
}: {
  inbox: Inbox;
  chats: ChatSummary[];
  /** One moment for the whole render, so no two rings disagree. */
  now: string;
  /** The connect id or chat id currently open, so its row can be marked. */
  activeId?: string;
}) {
  const waiting = inbox.incoming.filter((c) => c.status === "pending");

  /*
   * Accepted notes are left out of "Ended", and merging the two lists is what
   * made that obvious.
   *
   * Saying yes to a note opens a chat, so an accepted connect and the
   * conversation it became are the same relationship. On two separate screens
   * that was invisible; on one it put the same person in "Conversations" with a
   * live fuse and in "Ended" directly underneath, which reads as a conversation
   * somehow both running and over. The same goes for a note you sent that
   * somebody accepted.
   *
   * Declined and expired notes stay: those became nothing, so the note is the
   * only record there is, and §5 says every ending carries an answer somebody
   * can go back and read.
   */
  const answered = inbox.incoming.filter(
    (c) => c.status !== "pending" && c.status !== "accepted",
  );
  const sent = inbox.outgoing.filter((c) => c.status === "pending");
  const sentAndEnded = inbox.outgoing.filter(
    (c) => c.status !== "pending" && c.status !== "accepted",
  );

  const open = chats.filter((chat) => !isChatClosed(chat.state));
  const closed = chats.filter((chat) => isChatClosed(chat.state));

  const nothingAtAll =
    inbox.incoming.length === 0 && inbox.outgoing.length === 0 && chats.length === 0;

  const ended = answered.length + sentAndEnded.length + closed.length;

  if (nothingAtAll) {
    return (
      <div className="w-full shrink-0 border-[var(--border-subtle)] md:w-[24rem] md:border-r">
        <p className="px-5 py-12 text-[16px] leading-relaxed text-[var(--text-secondary)]">
          {EMPTY_STATES.inbox}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full shrink-0 border-[var(--border-subtle)] md:w-[24rem] md:border-r">
      <Section id="waiting" title="Waiting on you" count={waiting.length} defaultOpen>
        <WaitingBubbles connects={waiting} now={now} activeId={activeId} />
      </Section>

      <Section
        id="conversations"
        title="Conversations"
        count={open.length + sent.length}
        defaultOpen
      >
        {open.length + sent.length === 0 ? (
          <p className="px-5 py-6 text-[15px] text-[var(--text-dim)]">
            Nothing going yet. Tonight&rsquo;s drop is another three chances.
          </p>
        ) : (
          <ul>
            {/*
              * Chats first, then notes you sent.
              *
              * `listChats` orders by fuse urgency rather than recency — a
              * conversation with nineteen hours left needs attention more than
              * one somebody messaged five minutes ago, and sorting by recency
              * would make the app reward whoever typed last. A sent note has no
              * fuse to rank by and nothing is owed on it, so it sits after them.
              */}
            {open.map((chat) => (
              <Row
                key={chat.id}
                href={`/chats/${chat.id}`}
                active={chat.id === activeId}
                photos={chat.partner.photos}
                name={chat.partner.firstName}
                withheld={chat.partner.withheld}
                detail={chatPreview(chat)}
                stamp={when(chat.lastAt, now)}
                trailing={
                  /* §7.2: a date-scheduled chat shows a calendar chip instead of
                     a ring — the fuse is paused, so time-left would lie. */
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
            {sent.map((connect) => (
              <Row
                key={connect.id}
                href={`/inbox/${connect.id}`}
                active={connect.id === activeId}
                photos={connect.to.photos}
                name={connect.to.firstName}
                detail={`You wrote — ${OUTCOME[connect.status] ?? connect.status}`}
                stamp={when(connect.createdAt, now)}
                quiet
              />
            ))}
          </ul>
        )}
      </Section>

      {ended > 0 && (
        <Section id="ended" title="Ended" count={ended}>
          <ul>
            {answered.map((connect) => (
              <Row
                key={connect.id}
                href={`/inbox/${connect.id}`}
                active={connect.id === activeId}
                photos={connect.from.photos}
                name={connect.from.firstName}
                detail="You answered"
                stamp={when(connect.respondedAt ?? connect.createdAt, now)}
                quiet
              />
            ))}
            {sentAndEnded.map((connect) => (
              <Row
                key={connect.id}
                href={`/inbox/${connect.id}`}
                active={connect.id === activeId}
                photos={connect.to.photos}
                name={connect.to.firstName}
                detail={`You wrote — ${OUTCOME[connect.status] ?? connect.status}`}
                stamp={when(connect.respondedAt ?? connect.createdAt, now)}
                quiet
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
                stamp={when(chat.lastAt, now)}
                quiet
              />
            ))}
          </ul>
        </Section>
      )}
    </div>
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
  detail,
  stamp,
  quiet,
  withheld,
  trailing,
}: {
  href: RowHref;
  active: boolean;
  photos: { path: string }[];
  name: string;
  detail: string;
  /** How long ago, replacing the age that used to sit beside the name. */
  stamp: string;
  /** Nothing is owed on this one — sent, answered, or over. */
  quiet?: boolean;
  withheld?: boolean;
  /** The fuse ring or calendar chip, on chat rows only. */
  trailing?: React.ReactNode;
}) {
  const url = photos[0] ? publicPhotoUrl(photos[0].path) : "";
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
        <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
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

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[16px] font-medium">{name}</span>
            {/* Right-aligned and tabular so a column of times lines up. */}
            <span className="shrink-0 text-[12px] tabular-nums text-[var(--text-dim)]">
              {stamp}
            </span>
          </span>
          <span
            className={cn(
              "block truncate text-[14px]",
              quiet ? "text-[var(--text-dim)]" : "text-[var(--text-secondary)]",
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
