"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import Image from "next/image";
import { CARD_ACTIONS, DROP_COPY, PROMPT_LIBRARY } from "@noghost/config/copy";
import type { PromptRef } from "@noghost/types";
import { Button } from "@/components/ui/button";
import { ReportSheet } from "@/components/report/report-sheet";
import { VoicePlayer } from "@/components/ui/voice-player";
import { VoiceRecorder, type Recording } from "@/components/ui/voice-recorder";
import { cn } from "@/lib/utils";
import { publicPhotoUrl } from "@/lib/photos";
import type { DropCardView } from "@/lib/drop";
import { passCard, sendConnect, type CardActionState } from "./actions";
import { Countdown } from "./countdown";

/**
 * Focus Mode — one person fills the view (docs/design-decisions.md).
 *
 * The drop's entire argument is that you read three people properly, so there
 * is no grid and no thumbnail rail: a rail is the swiping mindset in a
 * different shape. You move between cards deliberately, and you can move back —
 * §9.3 promises "take your time, they're not going anywhere for 24 hours", so
 * an answered card stays readable instead of vanishing.
 */

const initial: CardActionState = {};

export function DropStack({
  firstName,
  cards,
  nextReleaseAt,
}: {
  firstName: string;
  cards: DropCardView[];
  nextReleaseAt: string;
}) {
  /*
   * The card in focus is tracked by id, not by position.
   *
   * A server re-render after a pass or a connect can hand back the same three
   * cards in a different order — `drop_cards` written in one batch share a
   * `created_at`, and while `lib/drop.ts` now sorts on `(created_at, id)` to
   * stop that, an index would silently point at whoever landed in that slot.
   * On a screen whose whole job is "read this one person", quietly swapping who
   * is on it is the worst possible failure. An id cannot drift.
   */
  const opening =
    cards.find((card) => card.action === "pending")?.cardId ?? cards[0]?.cardId ?? "";
  const [activeId, setActiveId] = useState(opening);

  const index = Math.max(
    cards.findIndex((card) => card.cardId === activeId),
    0,
  );
  const card = cards[index];
  if (!card) return null;

  const answered = cards.filter((c) => c.action !== "pending").length;

  return (
    <div className="mx-auto w-full max-w-[42rem] px-6 py-10 md:py-14">
      <header className="mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-[34px] font-extrabold leading-[1.05] tracking-[-0.035em] md:text-[42px]">
          {DROP_COPY.header.replace("{{FIRST_NAME}}", firstName)}
        </h1>
        <p className="mt-3 max-w-[32rem] text-[17px] leading-relaxed text-[var(--text-secondary)]">
          {DROP_COPY.subheader.replace("{{N}}", String(cards.length))}
        </p>
      </header>

      {/* Position, not progress. Deliberately not a progress bar — three people
          are not a task to complete. */}
      <div className="mb-5 flex items-center justify-between gap-4 border-y border-[var(--border-subtle)] py-3">
        <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
          {index + 1} of {cards.length}
          {answered > 0 && (
            <span className="ml-2 normal-case tracking-normal opacity-70">
              · {answered} answered
            </span>
          )}
        </p>

        <div className="flex gap-1">
          {cards.map((c, i) => (
            <button
              key={c.cardId}
              type="button"
              onClick={() => setActiveId(c.cardId)}
              aria-label={`Card ${i + 1}: ${c.profile.firstName}${c.action === "pending" ? "" : `, ${c.action}`}`}
              aria-current={i === index ? "true" : undefined}
              className={cn(
                "h-2 w-8 rounded-full transition-colors duration-200",
                i === index
                  ? "bg-[var(--accent)]"
                  : c.action === "pending"
                    ? "bg-[var(--border)] hover:bg-[var(--text-dim)]"
                    : "bg-[var(--sage)]",
              )}
            />
          ))}
        </div>
      </div>

      <Card key={card.cardId} card={card} />

      <nav className="mt-8 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setActiveId(cards[Math.max(index - 1, 0)]!.cardId)}
          disabled={index === 0}
          className="text-[15px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--text-primary)] disabled:opacity-40 disabled:no-underline"
        >
          &larr; Previous
        </button>
        <button
          type="button"
          onClick={() => setActiveId(cards[Math.min(index + 1, cards.length - 1)]!.cardId)}
          disabled={index === cards.length - 1}
          className="text-[15px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--text-primary)] disabled:opacity-40 disabled:no-underline"
        >
          Next &rarr;
        </button>
      </nav>

      {answered === cards.length && (
        <div className="mt-10 border-t border-[var(--border-subtle)] pt-8 text-center">
          <p className="text-[17px] leading-relaxed text-[var(--text-secondary)]">
            That&rsquo;s tonight. Anyone you wrote to will answer either way &mdash; that&rsquo;s
            the deal here.
          </p>
          <Countdown to={nextReleaseAt} />
        </div>
      )}
    </div>
  );
}

function Card({ card }: { card: DropCardView }) {
  const { profile } = card;
  const facts = [
    profile.neighborhood,
    profile.occupation,
    profile.heightCm ? `${Math.floor(profile.heightCm / 2.54 / 12)}'${Math.round((profile.heightCm / 2.54) % 12)}"` : null,
  ].filter(Boolean);

  return (
    <article className="border border-[var(--border)] bg-[var(--bg-secondary)]">
      {card.isEncore && <EncoreBanner name={profile.firstName} week={card.encoreWeek} />}

      <div className="p-6 md:p-8">
        <h2
          aria-label={`${profile.firstName}, ${profile.age}`}
          className="font-[family-name:var(--font-display)] text-[30px] font-bold leading-none tracking-[-0.025em]"
        >
          {/* `aria-label` because the name and the age are separated only by a
              CSS margin: with no whitespace between them the accessible name
              came out "Bennett38". Labelling the heading keeps the layout and
              gives assistive tech a pause instead of a run-on. */}
          {profile.firstName}
          <span className="ml-3 text-[var(--text-dim)]">{profile.age}</span>
        </h2>
        {facts.length > 0 && (
          <p className="mt-2 text-[15px] text-[var(--text-secondary)]">{facts.join(" · ")}</p>
        )}

        {/*
          §7.2 puts the intro player on the card, and here is where it belongs:
          next to the name, before the photos, so hearing someone is an
          alternative to looking at them rather than a reward for scrolling past
          them. Absent for most people — the intro is optional and the funnel
          has no step for recording one yet — and a card without one simply
          doesn't show it.
        */}
        {profile.voiceIntroUrl && (
          <div className="mt-5">
            <VoicePlayer src={profile.voiceIntroUrl} durationMs={null} className="max-w-full" />
          </div>
        )}
      </div>

      {/*
        One photo leads, then their words, then the rest.

        Three full-bleed 4:5 photos in a row pushed the prompts about 2,400px
        down the page, so you scrolled a photo feed to reach the writing — the
        swiping mindset the Focus Mode decision exists to avoid, rebuilt
        vertically. A magazine leads with one image and sets the text next to
        it, which is also the order that serves "read three people properly".
      */}
      <Lead photo={profile.photos[0]} name={profile.firstName} />

      <div className="space-y-7 p-6 md:p-8">
        {profile.prompts.map((answer) => {
          const question =
            PROMPT_LIBRARY.find((p) => p.id === answer.prompt_id)?.text ?? answer.prompt_id;
          return (
            <div key={answer.prompt_id}>
              <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
                {question}
              </p>
              <p className="mt-2 text-[18px] leading-relaxed">{answer.answer}</p>
            </div>
          );
        })}

        {profile.interests.length > 0 && (
          <div className="border-t border-[var(--border-subtle)] pt-6">
            <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
              Into
            </p>
            <p className="mt-2 text-[16px] leading-relaxed text-[var(--text-secondary)]">
              {profile.interests.join(" · ")}
            </p>
          </div>
        )}
      </div>

      <Rest photos={profile.photos.slice(1)} name={profile.firstName} />

      <CardActions card={card} />
    </article>
  );
}

function EncoreBanner({ name, week }: { name: string; week: number | null }) {
  /*
   * §9.3's banner names the week. When the pass predates any card we can read,
   * the sentence loses its "in week N" clause rather than printing "week null"
   * or guessing a number.
   */
  const text = DROP_COPY.encoreBanner
    .replace("{{FIRST_NAME}}", name)
    .replace(week === null ? / in week \{\{WEEK\}\}/ : "{{WEEK}}", week === null ? "" : String(week));

  const [label, ...rest] = text.split("**").filter(Boolean);

  return (
    <p className="border-b border-[var(--accent)] bg-[var(--accent)]/10 px-6 py-4 text-[15px] leading-relaxed md:px-8">
      <strong className="font-semibold">{label}</strong>
      {rest.join("")}
    </p>
  );
}

/*
 * `publicPhotoUrl` returns "" in seed mode, and `next/image` throws on an empty
 * src rather than rendering nothing — so URLs are resolved before deciding what
 * to draw, never inside the JSX.
 */
function resolve(photos: { path: string }[]) {
  return photos
    .map((photo) => ({ path: photo.path, url: publicPhotoUrl(photo.path) }))
    .filter((photo) => photo.url.length > 0);
}

/** The photo they chose to lead with. */
function Lead({ photo, name }: { photo?: { path: string }; name: string }) {
  const [resolved] = resolve(photo ? [photo] : []);

  if (!resolved) {
    return (
      <div className="border-y border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-6 py-12 text-center text-[15px] text-[var(--text-dim)] md:px-8">
        {photo ? "Photos aren't available right now." : "No photos on this profile."}
      </div>
    );
  }

  return (
    <div className="relative aspect-[4/5] w-full border-y border-[var(--border-subtle)] bg-[var(--bg-tertiary)]">
      <Image
        src={resolved.url}
        alt={name}
        fill
        sizes="(max-width: 768px) 100vw, 42rem"
        className="object-cover"
        priority
      />
    </div>
  );
}

/** The remaining photos, two-up, after their words. */
function Rest({ photos, name }: { photos: { path: string }[]; name: string }) {
  const resolved = resolve(photos);
  if (resolved.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-px border-t border-[var(--border-subtle)] bg-[var(--border-subtle)]">
      {resolved.map((photo, i) => (
        <div key={photo.path} className="relative aspect-[4/5] bg-[var(--bg-tertiary)]">
          <Image
            src={photo.url}
            alt={`${name}, photo ${i + 2}`}
            fill
            sizes="(max-width: 768px) 50vw, 21rem"
            className="object-cover"
          />
        </div>
      ))}
    </div>
  );
}

function CardActions({ card }: { card: DropCardView }) {
  const [composing, setComposing] = useState(false);

  if (card.action === "passed") {
    return (
      <footer className="border-t border-[var(--border)] px-6 py-5 md:px-8">
        <p className="text-[16px] text-[var(--text-secondary)]">
          You passed. <span className="text-[var(--text-dim)]">{CARD_ACTIONS.passHint}</span>
        </p>
      </footer>
    );
  }

  if (card.action === "connected") {
    return (
      <footer className="border-t border-[var(--border)] px-6 py-5 md:px-8">
        <p className="text-[16px] text-[var(--text-secondary)]">
          Your note is with {card.profile.firstName}. They&rsquo;ll answer either way.
        </p>
      </footer>
    );
  }

  return (
    <footer className="border-t border-[var(--border)] p-6 md:p-8">
      {composing ? (
        <Composer card={card} onCancel={() => setComposing(false)} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => setComposing(true)}>{CARD_ACTIONS.connect}</Button>
            <PassButton card={card} />
          </div>
          {/*
            On its own line and quiet, below the two real choices. Passing is
            the answer to "not for me"; this is for the much rarer case, and
            sitting it beside Pass would invite it to be used as a louder one.
          */}
          <div className="mt-5 border-t border-[var(--border-subtle)] pt-4">
            <ReportSheet reportedId={card.profile.id} name={card.profile.firstName} />
          </div>
        </>
      )}
    </footer>
  );
}

function PassButton({ card }: { card: DropCardView }) {
  const [state, action, pending] = useActionState(passCard, initial);

  return (
    <form action={action} className="contents">
      <input type="hidden" name="cardId" value={card.cardId} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "…" : CARD_ACTIONS.pass}
      </Button>
      <span className="text-[14px] text-[var(--text-dim)]">{CARD_ACTIONS.passHint}</span>
      {state.error && (
        <p role="alert" className="w-full text-[14px] text-[var(--error)]">
          {state.error}
        </p>
      )}
    </form>
  );
}

/**
 * The connect composer.
 *
 * You pick the prompt or photo you're replying to before you can write, because
 * §6.2 has no like button: replying to something specific is the only way to
 * say hello, and the target is stored on the connect so the recipient's inbox
 * can show what you answered.
 */
function Composer({ card, onCancel }: { card: DropCardView; onCancel: () => void }) {
  const [state, action, pending] = useActionState(sendConnect, initial);
  const [target, setTarget] = useState<PromptRef | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);

  useEffect(() => {
    if (!recording) return;
    return () => URL.revokeObjectURL(recording.url);
  }, [recording]);

  /*
   * A spoken reply cannot ride in the form — there is no file input holding it —
   * so it builds its own FormData and dispatches. Same shape as the chat
   * composer, and for the same reason.
   */
  const sendSpoken = () => {
    if (!target || !recording) return;
    const data = new FormData();
    data.set("cardId", card.cardId);
    data.set("refType", target.type);
    data.set("refId", target.id);
    // No duration: `connects` has no column for one, unlike `messages`. The
    // player measures it from the file on the receiving side instead.
    data.set("audio", new File([recording.blob], "reply", { type: recording.blob.type }));
    startTransition(() => action(data));
  };

  const targets: { ref: PromptRef; label: string; detail: string }[] = [
    ...card.profile.prompts.map((answer) => ({
      ref: { type: "prompt", id: answer.prompt_id } as PromptRef,
      label: PROMPT_LIBRARY.find((p) => p.id === answer.prompt_id)?.text ?? answer.prompt_id,
      detail: answer.answer,
    })),
    ...card.profile.photos.map((photo, i) => ({
      ref: { type: "photo", id: photo.path } as PromptRef,
      label: i === 0 ? "Their first photo" : `Photo ${i + 1}`,
      detail: "",
    })),
  ];

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="cardId" value={card.cardId} />
      <input type="hidden" name="refType" value={target?.type ?? ""} />
      <input type="hidden" name="refId" value={target?.id ?? ""} />

      <div>
        <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
          What are you replying to?
        </p>
        <div className="mt-3 space-y-2">
          {targets.map((option) => {
            const selected = target?.type === option.ref.type && target?.id === option.ref.id;
            return (
              <button
                key={`${option.ref.type}:${option.ref.id}`}
                type="button"
                onClick={() => setTarget(option.ref)}
                aria-pressed={selected}
                className={cn(
                  "block w-full rounded-md border px-4 py-3 text-left transition-colors",
                  selected
                    ? "border-[var(--accent)] bg-[var(--accent)]/10"
                    : "border-[var(--border)] hover:border-[var(--text-dim)]",
                )}
              >
                <span className="block text-[13px] uppercase tracking-[0.1em] text-[var(--text-dim)]">
                  {option.label}
                </span>
                {option.detail && (
                  <span className="mt-1 block truncate text-[15px]">{option.detail}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label
          htmlFor={`reply-${card.cardId}`}
          className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]"
        >
          Your reply
        </label>
        <p className="mt-1 text-[15px] text-[var(--text-secondary)]">
          {DROP_COPY.composerHelper}
        </p>

        {recording ? (
          /*
             The written reply is replaced rather than sat beside: §6.2 asks for
             one reply, and a form offering both invites somebody to write
             something, record something else, and find out later which one was
             actually sent.
          */
          <div className="mt-3 space-y-3">
            <VoicePlayer
              src={recording.url}
              durationMs={recording.durationMs}
              mine
              className="max-w-full"
            />
            <button
              type="button"
              onClick={() => setRecording(null)}
              className="text-[15px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
            >
              Discard and write instead
            </button>
          </div>
        ) : (
          <>
            <textarea
              id={`reply-${card.cardId}`}
              name="reply"
              maxLength={1000}
              required
              rows={4}
              placeholder={
                target
                  ? "Say the thing you actually thought."
                  : "Pick something above first, then write."
              }
              className="mt-3 w-full resize-y rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-[16px] leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--n-400)] focus:border-[var(--accent)] focus:outline-none"
            />
            <div className="mt-3">
              <VoiceRecorder onRecorded={setRecording} disabled={pending} />
            </div>
          </>
        )}
      </div>

      {state.error && (
        <p role="alert" className="text-[15px] leading-snug text-[var(--error)]">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {recording ? (
          <Button type="button" onClick={sendSpoken} disabled={pending || !target}>
            {pending ? "Sending…" : `Send to ${card.profile.firstName}`}
          </Button>
        ) : (
          <Button type="submit" disabled={pending || !target}>
            {pending ? "Sending…" : `Send to ${card.profile.firstName}`}
          </Button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="text-[15px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
        >
          Not now
        </button>
      </div>
    </form>
  );
}
