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
              {/* Last and quietest of the three, but always present: the
                  Community Standards page promises reporting "from any profile
                  or chat", and a promise that depends on finding a menu is not
                  one. */}
              <div className="pt-1">
                <ReportSheet
                  reportedId={chat.partner.id}
                  name={chat.partner.firstName}
                  chatId={chat.id}
                />
              </div>
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
    <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] px-5 py-3.5 md:px-10 md:py-4">
      <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-[var(--bg-tertiary)]">
        {url && <Image src={url} alt="" fill sizes="44px" className="object-cover" />}
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
          className="truncate font-[family-name:var(--font-display)] text-[22px] font-bold tracking-[-0.02em]"
        >
          {chat.partner.firstName}
          {/* No age on a withheld partner — there is no profile left to read,
              and `age: 0` is a placeholder, not a fact. */}
          {!chat.partner.withheld && (
            <span className="ml-2 font-normal text-[var(--text-dim)]">{chat.partner.age}</span>
          )}
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

      {/*
        * No ring here.
        *
        * The line directly to the left already says "15 hours left" in words,
        * so the ring was saying the same thing twice in the one place where
        * there is room to say it properly. It still earns its place in the
        * list, where a row has no room for a sentence and the whole point is
        * comparing one conversation's urgency against another's.
        */}

      {/* Always visible while the chat is open — §7.2 calls this the chat's
          entire purpose, so it does not hide behind a menu. */}
      {/*
        * Rendered once, not twice behind breakpoints. `DateProposal` holds
        * form state, so a second copy for narrow screens would be a second
        * independent form — and whichever one was hidden would quietly keep
        * whatever had been typed into it.
        */}
      {!closed && chat.state !== "date_scheduled" && (
        <div className="w-full sm:w-auto">
          <DateProposal chatId={chat.id} name={chat.partner.firstName} />
        </div>
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
