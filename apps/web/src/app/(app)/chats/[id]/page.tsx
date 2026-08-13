import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { BRAND } from "@noghost/config";
import { CLOSURE_TEMPLATES, SYSTEM_CLOSURES } from "@noghost/config/copy";
import { isChatClosed } from "@noghost/types";
import { cn } from "@/lib/utils";
import { publicPhotoUrl } from "@/lib/photos";
import { requireMember } from "@/lib/member";
import { getChat, type ChatDate, type ChatDetail, type ChatMessage } from "@/lib/chats";
import { listChats } from "@/lib/chats";
import { Rail } from "../rail";
import { FuseRing } from "../fuse-ring";
import { VoicePlayer } from "@/components/ui/voice-player";
import { Composer } from "./composer";
import { DateProposal, RespondToDate } from "./propose-date";
import { CloseKindly } from "./close-kindly";
import { Checkin } from "./checkin";
import { AnswerGraduation, GraduationAsked, ProposeGraduation } from "./graduation";

export const metadata: Metadata = { title: "Chat" };
export const dynamic = "force-dynamic";

/**
 * One chat — spec §7.2.
 *
 * "Propose a date" sits in the header and is always visible while the chat is
 * open, because putting a real date on the calendar is the conversation's
 * entire purpose. Burying it behind a menu would make the fuse feel like a
 * punishment instead of a prompt.
 */
export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireMember();
  const now = new Date().toISOString();

  const [chat, chats] = await Promise.all([
    getChat(id, member.id, now),
    listChats(member.id, now),
  ]);
  if (!chat) notFound();

  const closed = isChatClosed(chat.state);

  return (
    <div className="flex flex-col md:flex-row">
      <Rail chats={chats} activeId={id} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header chat={chat} closed={closed} />

        <div className="flex-1 px-6 py-6 md:px-10">
          <div className="mx-auto max-w-[40rem] space-y-4">
            {/*
              Answering comes first when both are true — somebody who asked and
              was asked should be looking at the question, not at their own.
            */}
            {chat.graduation?.answer ? (
              <AnswerGraduation
                chatId={chat.id}
                graduationId={chat.graduation.answer.id}
                name={chat.partner.firstName}
              />
            ) : chat.graduation?.iAsked ? (
              <GraduationAsked name={chat.partner.firstName} />
            ) : null}

            {chat.checkin && (
              <Checkin
                chatId={chat.id}
                dateId={chat.checkin.dateId}
                placeName={chat.checkin.placeName}
                name={chat.partner.firstName}
                myAnswer={chat.checkin.myAnswer}
              />
            )}

            {chat.dates.map((date) => (
              <DateCard key={date.id} chatId={chat.id} date={date} />
            ))}

            {chat.messages.map((message) => (
              <Bubble key={message.id} message={message} partner={chat.partner.firstName} />
            ))}

            {closed && <ClosedNote chat={chat} />}
          </div>
        </div>

        {/*
          Closing kindly sits at the end of the thread, in normal flow — not in
          the sticky footer with the composer. Expanded it is a six-template
          picker plus a textarea, and a sticky element that tall stops being a
          footer and starts covering the conversation. It is also a deliberate
          act, not a toolbar button.
        */}
        {!closed && (
          <div className="px-6 pb-2 md:px-10">
            {/*
              Two triggers, one per line, each in its own block wrapper.
              Collapsed they are bare `<button>`s — inline, so `space-y-3` alone
              put them side by side and rendered "Close this kindlyFound
              someone?". A flex row is not the fix either: both expand into tall
              forms that need the full width.
            */}
            <div className="mx-auto max-w-[40rem] space-y-3">
              <div>
                <CloseKindly chatId={chat.id} name={chat.partner.firstName} />
              </div>
              {/*
                Gone for good once asked, and gone while their question is open.
                One ask per person is §6.5's whole mechanic, and a button that
                came back after a decline would be how the proposer found out —
                see `graduation` in `lib/chats.ts`.
              */}
              {!chat.graduation && (
                <div>
                  <ProposeGraduation chatId={chat.id} name={chat.partner.firstName} />
                </div>
              )}
            </div>
          </div>
        )}

        {!closed && (
          <div className="sticky bottom-0 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] px-6 py-4 md:px-10">
            <div className="mx-auto max-w-[40rem]">
              <Composer chatId={chat.id} name={chat.partner.firstName} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Header({ chat, closed }: { chat: ChatDetail; closed: boolean }) {
  const url = chat.partner.photos[0] ? publicPhotoUrl(chat.partner.photos[0].path) : "";

  return (
    <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] px-6 py-4 md:px-10">
      <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-[var(--bg-tertiary)]">
        {url && <Image src={url} alt="" fill sizes="44px" className="object-cover" />}
      </span>

      <div className="min-w-0 flex-1">
        {/* Labelled for the same reason as the drop card's heading: only a margin
            separates the name from the age, so the accessible name would read as
            one word. */}
        <h1
          aria-label={`${chat.partner.firstName}, ${chat.partner.age}`}
          className="truncate font-[family-name:var(--font-display)] text-[22px] font-bold tracking-[-0.02em]"
        >
          {chat.partner.firstName}
          <span className="ml-2 font-normal text-[var(--text-dim)]">{chat.partner.age}</span>
        </h1>
        <p className="text-[13px] text-[var(--text-dim)]">
          {closed
            ? "Closed"
            : chat.state === "date_scheduled"
              ? "Date on the calendar — the clock is paused"
              : chat.state === "post_date_checkin"
                ? "How did it go?"
                : `${chat.hoursLeft} hours left`}
        </p>
      </div>

      {!closed && <FuseRing urgency={chat.urgency} hoursLeft={chat.hoursLeft} />}

      {/* Always visible while the chat is open — §7.2 calls this the chat's
          entire purpose, so it does not hide behind a menu. */}
      {!closed && chat.state !== "date_scheduled" && (
        <DateProposal chatId={chat.id} name={chat.partner.firstName} />
      )}
    </header>
  );
}

function Bubble({ message, partner }: { message: ChatMessage; partner: string }) {
  if (message.kind === "system") {
    const body = message.body ?? "";
    const template = CLOSURE_TEMPLATES.find((t) => t.id === body);
    const system = SYSTEM_CLOSURES[body as keyof typeof SYSTEM_CLOSURES];
    const text = (template?.body ?? system ?? body)
      .replace("{{APP_NAME}}", BRAND.APP_NAME)
      .replace("{{FIRST_NAME}}", partner);

    return (
      <div className="border-y border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-5 py-4">
        <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
          Closing note
        </p>
        <p className="mt-2 text-[17px] leading-relaxed">{text}</p>
      </div>
    );
  }

  if (message.kind === "voice") {
    return (
      <VoicePlayer
        src={message.voiceUrl}
        durationMs={message.voiceDurationMs}
        mine={message.mine}
      />
    );
  }

  return (
    <p
      className={cn(
        "max-w-[80%] rounded-lg px-4 py-3 text-[16px] leading-relaxed",
        message.mine
          ? "ml-auto bg-[var(--accent)]/12"
          : "border border-[var(--border-subtle)] bg-[var(--bg-secondary)]",
      )}
    >
      {message.body}
    </p>
  );
}

/** A proposed or confirmed plan, rendered as the rich card §7.2 asks for. */
function DateCard({ chatId, date }: { chatId: string; date: ChatDate }) {
  if (date.status === "declined" || date.status === "cancelled") return null;

  const when = new Date(date.scheduledFor).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      className={cn(
        "rounded-lg border p-5",
        date.status === "confirmed"
          ? "border-[var(--sage)] bg-[var(--sage)]/10"
          : "border-[var(--accent)] bg-[var(--accent)]/10",
      )}
    >
      <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
        {date.status === "confirmed" ? "It's on" : "A plan, waiting on an answer"}
      </p>
      <p className="mt-2 text-[18px] leading-snug">
        {date.placeName}
        <span className="block text-[16px] text-[var(--text-secondary)]">{when}</span>
      </p>
      {date.placeNote && (
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-secondary)]">
          {date.placeNote}
        </p>
      )}

      {date.status === "confirmed" && (
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--sage-text)]">
          The seven-day clock is paused until then.
        </p>
      )}

      {/* Only the other person can answer — §6.3's anti-loophole rule, enforced
          in `respond_to_date` and reflected here so nobody is offered a button
          the database will refuse. */}
      {date.status === "proposed" && date.awaitingMe && (
        <RespondToDate chatId={chatId} dateId={date.id} />
      )}
      {date.status === "proposed" && !date.awaitingMe && (
        <p className="mt-3 text-[15px] text-[var(--text-secondary)]">
          Waiting on them to confirm. You proposed it, so it&rsquo;s theirs to answer.
        </p>
      )}
    </div>
  );
}

function ClosedNote({ chat }: { chat: ChatDetail }) {
  return (
    <div className="border-t border-[var(--border-subtle)] pt-6 text-center">
      <p className="text-[16px] leading-relaxed text-[var(--text-secondary)]">
        This chat is closed
        {chat.state === "closed_fuse" && " — the seven days ran out"}
        {chat.state === "closed_by_user" && " — one of you ended it, with words"}
        {chat.state === "closed_graduated" && " — somebody found someone"}
        {chat.state === "closed_season_end" && " — the season ended"}. Nothing more can be sent,
        and that&rsquo;s the point: it ended with an answer rather than silence.
      </p>
    </div>
  );
}
