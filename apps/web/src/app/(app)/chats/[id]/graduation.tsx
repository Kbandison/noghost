"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { proposeGraduation, respondGraduation, type ChatActionState } from "../actions";

const initial: ChatActionState = {};

/**
 * Found Someone — spec §6.5.
 *
 * Two halves, deliberately asymmetric. Asking is small and reversible, so it
 * gets a confirm step only to make sure it was intended. Answering yes ends the
 * season for both people — every other open chat either of them has closes with
 * the "met someone" note — so the card says that out loud before the button.
 *
 * Saying no is private (§6.5), and that costs more than filtering a row. From
 * the proposer's side a decline has to be *indistinguishable from silence*, so
 * the ask is spent the moment it is made: the button never returns, the "You
 * asked" card never changes wording, and the action returns nothing either way.
 * Anything that came back after a no — a button, a different sentence, a
 * timestamp — would be how they found out. Turning someone down here should not
 * cost them the conversation.
 */
export function ProposeGraduation({ chatId, name }: { chatId: string; name: string }) {
  const [state, action, pending] = useActionState(proposeGraduation, initial);
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="text-[15px] text-[var(--sage-text)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
      >
        Found someone?
      </button>
    );
  }

  return (
    <form action={action} className="space-y-4 border-t border-[var(--border)] pt-5">
      <input type="hidden" name="chatId" value={chatId} />

      <div>
        <h2 className="font-[family-name:var(--font-display)] text-[20px] font-bold tracking-[-0.02em]">
          Is it {name}?
        </h2>
        <p className="mt-1.5 text-[16px] leading-relaxed text-[var(--text-secondary)]">
          We&rsquo;ll ask them the same question. If they say yes, the season ends for you both:
          your other chats close with a note explaining why, and the drops stop.
        </p>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-dim)]">
          If they say no, nothing happens and you won&rsquo;t be told &mdash; this chat just
          carries on.
        </p>
      </div>

      {state.error && (
        <p role="alert" className="text-[15px] leading-snug text-[var(--error)]">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Asking…" : `Ask ${name}`}
        </Button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          className="text-[15px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
        >
          Not yet
        </button>
      </div>
    </form>
  );
}

/** The other side of the question. */
export function AnswerGraduation({
  chatId,
  graduationId,
  name,
}: {
  chatId: string;
  graduationId: string;
  name: string;
}) {
  const [state, action, pending] = useActionState(respondGraduation, initial);

  return (
    <section className="rounded-lg border border-[var(--sage)] bg-[var(--sage)]/12 p-5">
      <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
        {name} asked
      </p>
      <p className="mt-2 text-[18px] leading-relaxed">Have you two found each other?</p>
      <p className="mt-3 text-[16px] leading-relaxed text-[var(--text-secondary)]">
        Yes ends the season for you both &mdash; your other chats close with a note explaining
        why, and the drops stop. No is private: {name} is never told, and this chat carries on.
      </p>

      {state.error && (
        <p role="alert" className="mt-4 text-[15px] leading-snug text-[var(--error)]">
          {state.error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <form action={action}>
          <input type="hidden" name="chatId" value={chatId} />
          <input type="hidden" name="graduationId" value={graduationId} />
          <input type="hidden" name="confirm" value="yes" />
          <Button type="submit" disabled={pending}>
            {pending ? "…" : "Yes, it's them"}
          </Button>
        </form>

        <form action={action}>
          <input type="hidden" name="chatId" value={chatId} />
          <input type="hidden" name="graduationId" value={graduationId} />
          <input type="hidden" name="confirm" value="no" />
          <Button type="submit" variant="secondary" disabled={pending}>
            Not yet
          </Button>
        </form>
      </div>
    </section>
  );
}

/**
 * The proposer's side, and it never changes.
 *
 * This is shown whether the question is unanswered or was declined — the read
 * layer does not distinguish, on purpose, because a card that changed would be
 * the notification §6.5 forbids. So the copy has to be true of both, which rules
 * out "waiting" and rules out "they haven't answered". It says what will and
 * won't reach them instead, which is the honest version of a screen that is
 * deliberately holding something back.
 *
 * A yes needs no card: both accounts graduate and `/tonight` sends them to the
 * celebration.
 */
export function GraduationAsked({ name }: { name: string }) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
      <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
        You asked
      </p>
      <p className="mt-2 text-[17px] leading-relaxed">
        {name} has the question, and it was yours to ask once.
      </p>
      <p className="mt-3 text-[16px] leading-relaxed text-[var(--text-secondary)]">
        If it&rsquo;s a yes you&rsquo;ll know &mdash; the season ends for you both. A no stays with
        them, so this card won&rsquo;t change and nothing here is a hint either way. The chat
        carries on regardless.
      </p>
    </section>
  );
}
