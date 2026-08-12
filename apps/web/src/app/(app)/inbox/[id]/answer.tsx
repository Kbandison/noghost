"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { respond, type RespondState } from "../actions";

/** Lives here because a "use server" module may only export async functions. */
const initial: RespondState = {};

/**
 * Accept or decline — spec §7.2 and §6.2.
 *
 * Accept goes straight through: saying yes to someone is not a decision anyone
 * needs protecting from, and a confirmation step there would only add friction
 * to the one outcome the product wants.
 *
 * Decline gets the confirm sheet §7.2 specifies, and it exists to *reassure*
 * rather than to warn. The thing people hesitate over is whether saying no
 * makes them the bad guy, so the sheet's job is to say what actually happens:
 * they get a real answer, written kindly, and no reply channel to argue in.
 */
export function Answer({ connectId, name }: { connectId: string; name: string }) {
  const [state, action, pending] = useActionState(respond, initial);
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-[22px] font-bold tracking-[-0.02em]">
          Answer {name} no?
        </h2>
        <p className="mt-3 text-[17px] leading-relaxed text-[var(--text-secondary)]">
          They&rsquo;ll get a real answer, not silence &mdash; a short, kind note that says you
          read theirs and it isn&rsquo;t a match this season. There&rsquo;s no reply channel, so
          this is finished for both of you.
        </p>
        <p className="mt-3 text-[16px] leading-relaxed text-[var(--text-dim)]">
          You won&rsquo;t see {name} in a drop again this season, and they&rsquo;re never told you
          were the one who said no rather than someone who never looked.
        </p>

        {state.error && (
          <p role="alert" className="mt-4 text-[15px] leading-snug text-[var(--error)]">
            {state.error}
          </p>
        )}

        <form action={action} className="mt-6 flex flex-wrap items-center gap-3">
          <input type="hidden" name="connectId" value={connectId} />
          <input type="hidden" name="decision" value="decline" />
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send the note"}
          </Button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-[15px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
          >
            Back
          </button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[17px] leading-relaxed text-[var(--text-secondary)]">
        Either answer is a real one. Yes opens a chat with seven days on it; no sends a kind note
        and closes it.
      </p>

      {state.error && (
        <p role="alert" className="mt-4 text-[15px] leading-snug text-[var(--error)]">
          {state.error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <form action={action}>
          <input type="hidden" name="connectId" value={connectId} />
          <input type="hidden" name="decision" value="accept" />
          <Button type="submit" disabled={pending}>
            {pending ? "…" : `Yes, open a chat`}
          </Button>
        </form>

        <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
          No thanks
        </Button>
      </div>
    </div>
  );
}
