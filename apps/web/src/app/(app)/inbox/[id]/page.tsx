import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND } from "@noghost/config";
import { PROMPT_LIBRARY, SYSTEM_CLOSURES } from "@noghost/config/copy";
import type { ProfilePhoto, ProfilePromptAnswer, PromptRef } from "@noghost/types";
import { publicPhotoUrl } from "@/lib/photos";
import { requireMember } from "@/lib/member";
import { loadInbox, type IncomingConnect, type InboxPerson, type OutgoingConnect } from "@/lib/inbox";
import { Rail } from "../rail";
import { Answer } from "./answer";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

export default async function ConnectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireMember();
  const inbox = await loadInbox(member.id);

  const incoming = inbox.incoming.find((connect) => connect.id === id);
  const outgoing = inbox.outgoing.find((connect) => connect.id === id);
  if (!incoming && !outgoing) notFound();

  return (
    <div className="flex flex-col md:flex-row">
      <Rail inbox={inbox} activeId={id} />
      <div className="min-w-0 flex-1">
        {incoming ? (
          <Received connect={incoming} self={inbox.self} />
        ) : (
          <Sent connect={outgoing!} />
        )}
      </div>
    </div>
  );
}

/** A note somebody sent you. This is the screen §7.2 describes. */
function Received({
  connect,
  self,
}: {
  connect: IncomingConnect;
  self: { prompts: ProfilePromptAnswer[]; photos: ProfilePhoto[] };
}) {
  return (
    <div className="mx-auto max-w-[38rem] px-6 py-8 md:px-10 md:py-12">
      <Person person={connect.from} />

      <section className="mt-8 border-t border-[var(--border-subtle)] pt-8">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
          {connect.from.firstName} replied to
        </h2>
        {/*
          Looked up in *your* profile, not theirs. `prompt_ref` names something
          on the profile that appeared on their card, which on a note you
          received is yours — reading it from the sender's profile printed the
          question with no answer beneath it.
        */}
        <RepliedTo promptRef={connect.promptRef} prompts={self.prompts} />

        {connect.replyText && (
          <blockquote className="mt-5 border-l-2 border-[var(--accent)] pl-5 text-[19px] leading-relaxed">
            {connect.replyText}
          </blockquote>
        )}
        {!connect.replyText && connect.replyVoicePath && (
          <p className="mt-5 text-[16px] text-[var(--text-secondary)]">
            They left a voice note. The player arrives with chat.
          </p>
        )}
      </section>

      <div className="mt-10 border-t border-[var(--border-subtle)] pt-8">
        {connect.status === "pending" ? (
          <Answer connectId={connect.id} name={connect.from.firstName} />
        ) : (
          <Settled connect={connect} />
        )}
      </div>
    </div>
  );
}

/** What was replied to — the prompt and its answer, or the photo. */
function RepliedTo({
  promptRef: ref,
  prompts,
}: {
  // Not called `ref`: React reserves that name, and passing it to a component
  // fails at runtime with "refs cannot be used in Server Components".
  promptRef: PromptRef | null;
  prompts: ProfilePromptAnswer[];
}) {
  if (ref?.type === "prompt") {
    const answer = prompts.find((p) => p.prompt_id === ref.id);
    const question = PROMPT_LIBRARY.find((p) => p.id === ref.id)?.text ?? ref.id;
    return (
      <div className="mt-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4">
        <p className="text-[13px] uppercase tracking-[0.1em] text-[var(--text-dim)]">{question}</p>
        {answer && <p className="mt-1.5 text-[16px] leading-relaxed">{answer.answer}</p>}
      </div>
    );
  }

  if (ref?.type === "photo") {
    const url = publicPhotoUrl(ref.id);
    return (
      <div className="mt-2 flex items-center gap-4">
        {url && (
          <div className="relative h-28 w-24 shrink-0 overflow-hidden rounded-md bg-[var(--bg-tertiary)]">
            <Image src={url} alt="The photo they replied to" fill sizes="96px" className="object-cover" />
          </div>
        )}
        <p className="text-[16px] text-[var(--text-secondary)]">One of their photos.</p>
      </div>
    );
  }

  return <p className="mt-2 text-[16px] text-[var(--text-dim)]">Something on their profile.</p>;
}

/** Already answered. Says which way, and what happens next. */
function Settled({ connect }: { connect: IncomingConnect }) {
  if (connect.status === "accepted") {
    return (
      <div>
        <p className="text-[18px] leading-relaxed">
          You said yes to {connect.from.firstName}.
        </p>
        {connect.chat && (
          <p className="mt-3 text-[16px] leading-relaxed text-[var(--text-secondary)]">
            Your seven days started then and run out{" "}
            <span className="whitespace-nowrap">
              {new Date(connect.chat.fuseExpiresAt).toLocaleString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
            . Put a real date on the calendar before then, or the chat closes itself with a note
            to you both.
          </p>
        )}
        {/* Honest about what isn't built rather than linking to a 404. */}
        <p className="mt-4 text-[15px] text-[var(--text-dim)]">
          The chat itself opens in the next release.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[18px] leading-relaxed">
        You answered {connect.from.firstName}.
      </p>
      <p className="mt-3 text-[16px] leading-relaxed text-[var(--text-secondary)]">
        They got a real note about it, not silence. There&rsquo;s no reply channel &mdash; it&rsquo;s
        finished, for both of you.
      </p>
    </div>
  );
}

/**
 * A note you sent, and its answer.
 *
 * The declined case is the one that has to exist. `respond_connect` writes
 * `connect_declined` as an `inapp` notification and §8 marks it `required:
 * true`; this is where that lands, printed verbatim from §9.2's `decline_auto`.
 */
function Sent({ connect }: { connect: OutgoingConnect }) {
  const note = SYSTEM_CLOSURES.decline_auto
    .replace("{{FIRST_NAME}}", connect.to.firstName)
    .replace("{{APP_NAME}}", BRAND.APP_NAME);

  return (
    <div className="mx-auto max-w-[38rem] px-6 py-8 md:px-10 md:py-12">
      <Person person={connect.to} />

      <section className="mt-8 border-t border-[var(--border-subtle)] pt-8">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
          You replied to
        </h2>
        {/* Here the ref points at *their* profile — you replied to something on
            the card you were shown. */}
        <RepliedTo promptRef={connect.promptRef} prompts={connect.to.prompts} />

        <h2 className="mt-7 text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
          What you wrote
        </h2>
        {connect.replyText && (
          <blockquote className="mt-3 border-l-2 border-[var(--border)] pl-5 text-[18px] leading-relaxed text-[var(--text-secondary)]">
            {connect.replyText}
          </blockquote>
        )}
      </section>

      <div className="mt-10 border-t border-[var(--border-subtle)] pt-8">
        {connect.status === "pending" && (
          <p className="text-[17px] leading-relaxed text-[var(--text-secondary)]">
            {connect.to.firstName} hasn&rsquo;t answered yet. They will &mdash; that&rsquo;s the
            deal here, and nothing about your note is being nudged in the meantime.
          </p>
        )}

        {connect.status === "accepted" && (
          <>
            <p className="text-[18px] leading-relaxed">
              {connect.to.firstName} said yes.
            </p>
            {connect.chat && (
              <p className="mt-3 text-[16px] leading-relaxed text-[var(--text-secondary)]">
                Seven days on the clock, until{" "}
                <span className="whitespace-nowrap">
                  {new Date(connect.chat.fuseExpiresAt).toLocaleString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                .
              </p>
            )}
            <p className="mt-4 text-[15px] text-[var(--text-dim)]">
              The chat itself opens in the next release.
            </p>
          </>
        )}

        {(connect.status === "declined" || connect.status === "expired") && (
          <div>
            <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
              Their answer
            </h2>
            <p className="mt-3 text-[18px] leading-relaxed">{note}</p>
            <p className="mt-5 text-[15px] text-[var(--text-dim)]">
              There&rsquo;s nothing to reply to, and that&rsquo;s deliberate.{" "}
              <Link
                href="/tonight"
                className="text-[var(--accent-text)] underline decoration-[1.5px] underline-offset-4"
              >
                Tonight&rsquo;s drop
              </Link>{" "}
              is where your energy goes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Person({ person }: { person: InboxPerson }) {
  const url = person.photos[0] ? publicPhotoUrl(person.photos[0].path) : "";
  const facts = [person.neighborhood, person.occupation].filter(Boolean);

  return (
    <header className="flex items-start gap-5">
      <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-md bg-[var(--bg-tertiary)]">
        {url && <Image src={url} alt={person.firstName} fill sizes="80px" className="object-cover" />}
      </div>
      <div className="min-w-0">
        <h1 className="font-[family-name:var(--font-display)] text-[30px] font-bold leading-none tracking-[-0.025em]">
          {person.firstName}
          <span className="ml-3 text-[var(--text-dim)]">{person.age}</span>
        </h1>
        {facts.length > 0 && (
          <p className="mt-2 text-[15px] text-[var(--text-secondary)]">{facts.join(" · ")}</p>
        )}
        {person.interests.length > 0 && (
          <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--text-dim)]">
            {person.interests.slice(0, 6).join(" · ")}
          </p>
        )}
      </div>
    </header>
  );
}
