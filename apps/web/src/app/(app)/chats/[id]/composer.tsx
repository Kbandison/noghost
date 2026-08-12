"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { sendMessage, type ChatActionState } from "../actions";

const initial: ChatActionState = {};

/**
 * The message composer.
 *
 * Text only for now. §7.2 also specifies hold-to-record voice notes; the schema
 * and the RLS policy already allow `kind = 'voice'`, so that arrives with the
 * MediaRecorder work rather than needing anything here to change.
 *
 * Uncontrolled on purpose: React 19 resets a form after its action runs, which
 * clears the textarea on a successful send without any state to manage.
 */
export function Composer({ chatId, name }: { chatId: string; name: string }) {
  const [state, action, pending] = useActionState(sendMessage, initial);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="chatId" value={chatId} />

      <label htmlFor={`body-${chatId}`} className="sr-only">
        Message {name}
      </label>
      <textarea
        id={`body-${chatId}`}
        name="body"
        rows={2}
        maxLength={4000}
        required
        placeholder={`Message ${name}`}
        className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-[16px] leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--n-400)] focus:border-[var(--accent)] focus:outline-none"
      />

      {state.error && (
        <p role="alert" className="text-[15px] leading-snug text-[var(--error)]">
          {state.error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}
