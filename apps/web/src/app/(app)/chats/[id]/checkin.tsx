"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { answerCheckin, type ChatActionState } from "../actions";

const initial: ChatActionState = {};

/**
 * The post-date check-in — spec §6.3.
 *
 * Two answers, and the privacy rule shapes every word on this card: neither
 * person ever learns the other's raw answer. There is no "they said continue"
 * and no "waiting on them to say yes", because both would leak it by
 * implication. What a member sees is their own answer and the outcome —
 * the chat continues with a fresh seven days, or it closes with a note.
 *
 * Either person choosing to close is enough. That is stated plainly rather than
 * hidden, because someone deciding not to continue should not have to wonder
 * whether their answer will be overruled — or whether the other person will be
 * told it was theirs.
 */
export function Checkin({
  chatId,
  dateId,
  placeName,
  name,
  myAnswer,
}: {
  chatId: string;
  dateId: string;
  placeName: string;
  name: string;
  myAnswer: "continue" | "close" | "no_response" | null;
}) {
  const [state, action, pending] = useActionState(answerCheckin, initial);

  const answered = myAnswer === "continue" || myAnswer === "close";

  return (
    <section className="rounded-lg border border-[var(--accent)] bg-[var(--accent)]/10 p-5">
      <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
        How was {placeName}?
      </p>

      {answered ? (
        <>
          <p className="mt-2 text-[17px] leading-relaxed">
            {myAnswer === "continue"
              ? "You said you'd like to keep going."
              : "You said this one has run its course."}
          </p>
          {/*
            Deliberately says nothing about whether they have answered, or how.
            "Waiting on them" would leak that they haven't; anything warmer would
            leak that they have.
          */}
          <p className="mt-3 text-[16px] leading-relaxed text-[var(--text-secondary)]">
            {myAnswer === "continue"
              ? "If they say the same, you get a fresh seven days. If not, it closes with a note — and either way, nobody is told who said what."
              : "It closes with a note. They are never told which of you it was."}
          </p>
        </>
      ) : (
        <>
          <p className="mt-2 text-[17px] leading-relaxed">
            Your answer stays private. {name} never sees it &mdash; only what happens next.
          </p>
          <p className="mt-3 text-[16px] leading-relaxed text-[var(--text-secondary)]">
            Both of you saying yes starts a fresh seven days. Either of you saying no closes the
            chat with a kind note, and neither of you learns which it was.
          </p>

          {state.error && (
            <p role="alert" className="mt-4 text-[15px] leading-snug text-[var(--error)]">
              {state.error}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <form action={action}>
              <input type="hidden" name="chatId" value={chatId} />
              <input type="hidden" name="dateId" value={dateId} />
              <input type="hidden" name="answer" value="continue" />
              <Button type="submit" disabled={pending}>
                {pending ? "…" : "I'd like to keep going"}
              </Button>
            </form>

            <form action={action}>
              <input type="hidden" name="chatId" value={chatId} />
              <input type="hidden" name="dateId" value={dateId} />
              <input type="hidden" name="answer" value="close" />
              <Button type="submit" variant="secondary" disabled={pending}>
                This one has run its course
              </Button>
            </form>
          </div>
        </>
      )}
    </section>
  );
}
