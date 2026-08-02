"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { decide, type DecisionState } from "../actions";

const initial: DecisionState = {};

/**
 * The decision. Sticky, because the reviewer scrolls the profile and the
 * verdict must stay reachable without scrolling back.
 *
 * Reject opens a reason field rather than firing immediately — an irreversible
 * outcome shouldn't be one click away from where the cursor already is, and
 * the reason is required anyway.
 */
export function DecisionBar({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(decide, initial);
  const [rejecting, setRejecting] = useState(false);

  return (
    <form
      action={action}
      className="sticky bottom-0 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-3"
    >
      <input type="hidden" name="id" value={id} />

      {state.error && (
        <p role="alert" className="mb-2.5 text-[13px] leading-snug text-[var(--error)]">
          {state.error}
        </p>
      )}

      {rejecting && (
        <div className="mb-3">
          <label
            htmlFor="reason"
            className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-dim)]"
          >
            Why (internal only — {name} never sees this)
          </label>
          <input
            id="reason"
            name="reason"
            autoFocus
            placeholder="Selfie doesn't match the photos"
            className="mt-1 w-full rounded-[3px] border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[14px] focus:border-[var(--accent)] focus:outline-none"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {rejecting ? (
          <>
            <Button
              type="submit"
              name="decision"
              value="rejected"
              tone="danger"
              disabled={pending}
            >
              {pending ? "Saving…" : `Reject ${name}`}
            </Button>
            <Button type="button" tone="quiet" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              type="submit"
              name="decision"
              value="admitted"
              tone="primary"
              disabled={pending}
            >
              {pending ? "Saving…" : "Admit"}
            </Button>
            <Button type="submit" name="decision" value="waitlisted" disabled={pending}>
              Waitlist
            </Button>
            <Button type="button" tone="quiet" onClick={() => setRejecting(true)}>
              Reject
            </Button>
            <p className="ml-auto text-[12px] text-[var(--text-dim)]">
              Admitting starts their claim window and sends the email and SMS.
            </p>
          </>
        )}
      </div>
    </form>
  );
}
