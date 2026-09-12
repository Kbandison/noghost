import Image from "next/image";
import { notFound } from "next/navigation";
import { BRAND } from "@noghost/config";
import { CLOSURE_TEMPLATES, SYSTEM_CLOSURES } from "@noghost/config/copy";
import { isChatClosed } from "@noghost/types";
import { cn } from "@/lib/utils";
import { publicPhotoUrl } from "@/lib/photos";
import { requireMember } from "@/lib/member";
import { getChat, type ChatDate, type ChatDetail, type ChatMessage } from "@/lib/chats";
import { VoicePlayer } from "@/components/ui/voice-player";
import { ReportSheet } from "@/components/report/report-sheet";
import { ChatMenu } from "./chat-menu";
import { Composer } from "./composer";
import { DateProposal, RespondToDate } from "./propose-date";
import { CloseKindly } from "./close-kindly";
import { Checkin } from "./checkin";
import { AnswerGraduation, GraduationAsked, ProposeGraduation } from "./graduation";


/**
 * One chat — spec §7.2.
 *
 * "Propose a date" sits in the header and is always visible while the chat is
 * open, because putting a real date on the calendar is the conversation's
 * entire purpose. Burying it behind a menu would make the fuse feel like a
 * punishment instead of a prompt.
 */
/**
 * One conversation, with no list around it.
 *
 * Split out of the page so the same markup serves the full page at
 * `/chats/[id]` — a refresh, a shared link, a notification — and the dialog the
 * Inbox opens over itself. One definition is the only way the two can be
 * guaranteed to agree.
 */
export async function ChatDetailView({ id }: { id: string }) {
  const member = await requireMember();
  const now = new Date().toISOString();

  // `inbox` joins these because the rail lists notes alongside chats now.
  const chat = await getChat(id, member.id, now);
  if (!chat) notFound();

  const closed = isChatClosed(chat.state);

  return (
    /*
     * A fixed frame: name bar at the top, composer at the bottom, and only the
     * messages between them moving.
     *
     * These were `sticky` inside whatever scrolled around them, which works
     * until the container changes — in the dialog the whole detail scrolled as
     * one and the composer drifted up the screen with it. Owning the height
     * here means the layout is the same in the dialog and on the page, and
     * `min-h-0` is what lets the middle actually shrink: a flex child defaults
     * to its content size and would otherwise push the composer off the bottom
     * rather than scroll.
     */
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <Header chat={chat} closed={closed} />

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-8">
        <div className="mx-auto max-w-[38rem] space-y-3">
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
        Pinned, not sticky. The three endings that used to sit above this — close
        kindly, found someone, report — are in the name bar's menu now, so this
        is only ever the composer and stays one row tall.
      */}
      {!closed && (
        <div className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] px-5 py-3 md:px-8">
          <div className="mx-auto max-w-[38rem]">
            <Composer chatId={chat.id} name={chat.partner.firstName} />
          </div>
        </div>
      )}
    </div>
  );
}

function Header({ chat, closed }: { chat: ChatDetail; closed: boolean }) {
  const url = chat.partner.photos[0] ? publicPhotoUrl(chat.partner.photos[0].path) : "";

  return (
    /*
     * Wraps, because this now renders at 372px as well as at full width.
     *
     * As one unwrapped row it was built for a page. Inside the dialog the
     * "Propose a date" button took most of the line, the name truncated to
     * "T." and "15 hours left" broke over three lines next to it. `flex-wrap`
     * plus a full-width button below `sm` gives the button its own row when
     * there is no space for it, and leaves the wide layout untouched.
     */
    <header className="relative z-20 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] px-4 py-2.5 md:px-8 md:py-3">
      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-[var(--bg-tertiary)]">
        {url && <Image src={url} alt="" fill sizes="36px" className="object-cover" />}
      </span>

      {/* `basis-0` with `flex-1` so the name column gives up space to the ring
          before it starts truncating — a name is the one thing here that must
          stay readable. */}
      <div className="min-w-0 flex-1 basis-0">
        {/* Labelled for the same reason as the drop card's heading: only a margin
            separates the name from the age, so the accessible name would read as
            one word. */}
        <h1
          aria-label={
            chat.partner.withheld
              ? "A closed conversation"
              : `${chat.partner.firstName}, ${chat.partner.age}`
          }
          className="truncate font-[family-name:var(--font-display)] text-[17px] font-bold tracking-[-0.02em]"
        >
          {chat.partner.firstName}
          {/* No age on a withheld partner — there is no profile left to read,
              and `age: 0` is a placeholder, not a fact. */}
          {!chat.partner.withheld && (
            <span className="ml-2 font-normal text-[var(--text-dim)]">{chat.partner.age}</span>
          )}
        </h1>
        <p className="text-[12px] text-[var(--text-dim)]">
          {closed
            ? "Closed"
            : chat.state === "date_scheduled"
              ? "Date on the calendar — the clock is paused"
              : chat.state === "post_date_checkin"
                ? "How did it go?"
                : `${chat.hoursLeft} hours left`}
        </p>
      </div>

      {/*
        * No ring here. The line to the left already says "15 hours left" in
        * words, so the ring said the same thing twice in the one place with
        * room to say it properly. It still earns its place in the list, where a
        * row has no room for a sentence and the point is comparing one
        * conversation's urgency against another's.
        */}

      {!closed && (
        <ChatMenu>
          <div>
            <CloseKindly chatId={chat.id} name={chat.partner.firstName} />
          </div>
          {/*
            Gone for good once asked, and gone while their question is open. One
            ask per person is §6.5's whole mechanic, and a button that came back
            after a decline would be how the proposer found out — see
            `graduation` in `lib/chats.ts`.
          */}
          {!chat.graduation && (
            <div>
              <ProposeGraduation chatId={chat.id} name={chat.partner.firstName} />
            </div>
          )}
          {/* Always present: the Community Standards page promises reporting
              "from any profile or chat". Behind a menu is still from the chat —
              what it must never be is absent. */}
          <div className="border-t border-[var(--border-subtle)] pt-3">
            <ReportSheet
              reportedId={chat.partner.id}
              name={chat.partner.firstName}
              chatId={chat.id}
            />
          </div>
        </ChatMenu>
      )}

      {/* Always visible while the chat is open — §7.2 calls this the chat's
          entire purpose, so it does not hide behind a menu. */}
      {/*
        * Rendered once, not twice behind breakpoints. `DateProposal` holds
        * form state, so a second copy for narrow screens would be a second
        * independent form — and whichever one was hidden would quietly keep
        * whatever had been typed into it.
        */}
      {/*
        * Inline again. It took its own full-width row while the header also
        * carried a fuse ring; with the ring gone and the menu reduced to three
        * dots, a compact button fits on the name row at 390px.
        */}
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
        <p className="mt-2 text-[15px] leading-relaxed">{text}</p>
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
        "max-w-[80%] rounded-lg px-3.5 py-2.5 text-[15px] leading-relaxed",
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
      <p className="mt-2 text-[16px] leading-snug">
        {date.placeName}
        <span className="block text-[14px] text-[var(--text-secondary)]">{when}</span>
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
      <p className="text-[15px] leading-relaxed text-[var(--text-secondary)]">
        This chat is closed
        {chat.state === "closed_fuse" && " — the seven days ran out"}
        {chat.state === "closed_by_user" &&
          /*
           * `closed_by_user` covers three endings now, and only two of them
           * were ended by a person. A report closes the chat as well, and
           * telling the reported member "one of you ended it" would be both
           * untrue and a hint — it points at the only other person in the room.
           * The note itself already says who closed it; this line agrees.
           */
          (chat.closureTemplateId === "removal"
            ? " — NoGhost closed it"
            : " — one of you ended it, with words")}
        {chat.state === "closed_graduated" && " — somebody found someone"}
        {chat.state === "closed_season_end" && " — the season ended"}. Nothing more can be sent,
        and that&rsquo;s the point: it ended with an answer rather than silence.
      </p>
    </div>
  );
}
