"use client";

import { useActionState, useState } from "react";
import { CLOSURE_TEMPLATES } from "@noghost/config/copy";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { closeChat, type ChatActionState } from "../actions";

const initial: ChatActionState = {};

/**
 * Closing kindly — spec §6.3, §9.2, §6.6.
 *
 * The template is required and the words are §9.2's, verbatim: the member picks
 * which true thing to say rather than composing an ending from nothing at 1am.
 * A personal line is optional and goes through the tone check.
 *
 * The tone check **offers** a rewrite; it never blocks. §6.6 is explicit that a
 * member is never prevented from closing, so a failed check comes back as a
 * suggestion with the original line still in the box and a "send it as I wrote
 * it" button beside it. That is the whole design: the product's opinion about
 * kindness is a suggestion, and the member's own words win.
 */
export function CloseKindly({ chatId, name }: { chatId: string; name: string }) {
  const [state, action, pending] = useActionState(closeChat, initial);
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [line, setLine] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[15px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
      >
        Close this kindly
      </button>
    );
  }

  const chosen = CLOSURE_TEMPLATES.find((template) => template.id === templateId);

  return (
    <form action={action} className="space-y-5 border-t border-[var(--border)] pt-5">
      <input type="hidden" name="chatId" value={chatId} />
      <input type="hidden" name="templateId" value={templateId ?? ""} />
      {/* Set only once a suggestion has been shown and declined. Sending it on
          the first submit would skip the check entirely. */}
      {state.suggestion && <input type="hidden" name="acknowledged" value="yes" />}

      <div>
        <h2 className="font-[family-name:var(--font-display)] text-[20px] font-bold tracking-[-0.02em]">
          End it with words
        </h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--text-secondary)]">
          {name}{" "}
          gets a real note, not silence. Pick the one that&rsquo;s true.
        </p>
      </div>

      <div className="space-y-2">
        {CLOSURE_TEMPLATES.map((template) => {
          const selected = template.id === templateId;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => setTemplateId(template.id)}
              aria-pressed={selected}
              className={cn(
                "block w-full rounded-md border px-4 py-3 text-left transition-colors",
                selected
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border)] hover:border-[var(--text-dim)]",
              )}
            >
              <span className="block text-[13px] uppercase tracking-[0.1em] text-[var(--text-dim)]">
                {template.label}
              </span>
              <span className="mt-1 block text-[15px] leading-relaxed">{template.body}</span>
            </button>
          );
        })}
      </div>

      {chosen && (
        <>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
              Add a line of your own{" "}
              <span className="font-normal normal-case tracking-normal">optional</span>
            </span>
            <textarea
              name="personalLine"
              rows={3}
              maxLength={500}
              value={line}
              onChange={(event) => setLine(event.target.value)}
              placeholder="Something specific, if you want to."
              className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-[16px] leading-relaxed placeholder:text-[var(--n-400)] focus:border-[var(--accent)] focus:outline-none"
            />
          </label>

          {state.suggestion && (
            <div
              role="alert"
              className="rounded-md border border-[var(--accent)] bg-[var(--accent)]/10 p-4"
            >
              <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
                A gentler way to say it
              </p>
              <p className="mt-2 text-[16px] leading-relaxed">{state.suggestion}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setLine(state.suggestion ?? "")}
                >
                  Use this instead
                </Button>
                <span className="text-[14px] text-[var(--text-dim)]">
                  or send yours as written &mdash; it&rsquo;s your note
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {state.error && (
        <p role="alert" className="text-[15px] leading-snug text-[var(--error)]">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !templateId}>
          {pending ? "Sending…" : state.suggestion ? "Send it as I wrote it" : "Send the note"}
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[15px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
        >
          Not yet
        </button>
      </div>
    </form>
  );
}
