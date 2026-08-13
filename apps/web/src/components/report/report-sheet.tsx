"use client";

import { useActionState, useState } from "react";
import { BRAND, interpolate } from "@noghost/config";
import { REPORT_COPY, REPORT_REASONS } from "@noghost/config/copy";
import { Button } from "@/components/ui/button";
import { reportMember, type ReportState } from "./actions";

const initial: ReportState = {};

/**
 * Report a member — reachable from a chat, a drop card and an inbox note, which
 * is what the Community Standards page means by "from any profile or chat".
 *
 * Three decisions worth naming, all of them about the moment somebody is
 * deciding whether to do this at all:
 *
 * **The consequences come before the questions.** What happens the instant they
 * press send — mutual invisibility, no rematch this season, the conversation
 * closing with a note that doesn't name them — is the thing being weighed, so
 * it is read first rather than discovered afterwards.
 *
 * **There is no confirmation step.** Everywhere else in this product a
 * consequential action gets one; here it would be a second opportunity to talk
 * yourself out of reporting somebody who frightened you. The action is
 * reversible by a human, and hesitation is the failure mode.
 *
 * **The emergency line is above the form, not below it.** Someone in danger
 * should not have to fill in a reason picker to find out we are not the right
 * first call.
 */
export function ReportSheet({
  reportedId,
  name,
  chatId,
}: {
  reportedId: string;
  name: string;
  /** Present when reporting from inside a chat — that chat then closes. */
  chatId?: string;
}) {
  const [state, action, pending] = useActionState(reportMember, initial);
  const [open, setOpen] = useState(false);
  // Success is a redirect to `/reported`, so there is no "filed" state here —
  // see the note in `actions.ts` for why it cannot live in this component.
  const vars = { FIRST_NAME: name, SUPPORT_EMAIL: BRAND.SUPPORT_EMAIL };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[15px] text-[var(--text-dim)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
      >
        {interpolate(REPORT_COPY.trigger, vars)}
      </button>
    );
  }

  return (
    <form action={action} className="space-y-5 border-t border-[var(--border)] pt-5">
      <input type="hidden" name="reportedId" value={reportedId} />
      {chatId && <input type="hidden" name="chatId" value={chatId} />}

      <div>
        <h2 className="font-[family-name:var(--font-display)] text-[20px] font-bold tracking-[-0.02em]">
          {interpolate(REPORT_COPY.title, vars)}
        </h2>
        <p className="mt-2 text-[16px] leading-relaxed text-[var(--text-secondary)]">
          {interpolate(REPORT_COPY.lead, vars)}
        </p>
        <p className="mt-2 text-[16px] leading-relaxed text-[var(--text-secondary)]">
          {interpolate(REPORT_COPY.privacy, vars)}
        </p>
        {chatId && (
          <p className="mt-2 text-[16px] leading-relaxed text-[var(--text-secondary)]">
            {interpolate(REPORT_COPY.chatNote, vars)}
          </p>
        )}
      </div>

      <p className="rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-[15px] leading-relaxed text-[var(--text-secondary)]">
        {interpolate(REPORT_COPY.urgent, vars)}
      </p>

      {/* Radios in labelled rows rather than the `Chip` used elsewhere: each
          reason carries a line of explanation, and a chip is a word. */}
      <fieldset>
        <legend className="mb-3 text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
          {REPORT_COPY.reasonLabel}
        </legend>
        <div className="space-y-2">
          {REPORT_REASONS.map((reason) => (
            <label
              key={reason.id}
              className="flex cursor-pointer gap-3 rounded-md border border-[var(--border)] px-4 py-3 transition-colors hover:border-[var(--text-dim)] has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent)]/10"
            >
              <input
                type="radio"
                name="reason"
                value={reason.id}
                required
                className="mt-1 h-[18px] w-[18px] shrink-0 cursor-pointer accent-[var(--accent)]"
              />
              <span className="min-w-0">
                <span className="block text-[16px]">{reason.label}</span>
                <span className="mt-0.5 block text-[14px] leading-snug text-[var(--text-dim)]">
                  {reason.hint}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label
          htmlFor="report-detail"
          className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]"
        >
          {REPORT_COPY.detailLabel}
        </label>
        <textarea
          id="report-detail"
          name="detail"
          rows={4}
          maxLength={2000}
          placeholder={REPORT_COPY.detailPlaceholder}
          className="mt-2 w-full resize-y rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-[16px] leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--n-400)] focus:border-[var(--accent)] focus:outline-none"
        />
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-dim)]">
          {interpolate(REPORT_COPY.detailHint, vars)}
        </p>
      </div>

      {state.error && (
        <p role="alert" className="text-[15px] leading-snug text-[var(--error)]">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : REPORT_COPY.confirm}
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[15px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
        >
          {REPORT_COPY.cancel}
        </button>
      </div>
    </form>
  );
}
