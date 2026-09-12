"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { compSeat, type CompState } from "../actions";

const initial: CompState = {};

/**
 * Giving somebody their seat without charging them — 0038.
 *
 * Shown only for an application that is `admitted` and has no seat yet, which
 * is the one state where this is a real action rather than a no-op.
 *
 * It opens a reason field instead of firing on the first click, matching Reject
 * in `DecisionBar`, and for the same reason: this one moves money and the
 * function requires the reason anyway. Refusing here rather than letting
 * Postgres refuse means the reviewer finds out before the round trip.
 */
export function CompBar({
  id,
  name,
  priceCents,
}: {
  id: string;
  name: string;
  /** What they would otherwise pay, so the size of the gift is on screen. */
  priceCents: number | null;
}) {
  const [state, action, pending] = useActionState(compSeat, initial);
  const [open, setOpen] = useState(false);

  if (state.done) {
    return (
      <div className="sticky bottom-0 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-3 text-[13px] text-[var(--sage-text)]">
        {name} has their seat — no payment taken. They can get into the app now.
      </div>
    );
  }

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

      {open && (
        <div className="mb-3">
          <label
            htmlFor="comp-reason"
            className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-dim)]"
          >
            Why is this seat free? (internal &mdash; {name} never sees this)
          </label>
          <input
            id="comp-reason"
            name="reason"
            autoFocus
            placeholder="Founder — testing the season end to end"
            className="mt-1 w-full rounded-[3px] border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[14px] focus:border-[var(--accent)] focus:outline-none"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {open ? (
          <>
            <Button type="submit" tone="primary" disabled={pending}>
              {pending ? "Saving…" : "Give them the seat"}
            </Button>
            <Button type="button" tone="quiet" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button type="button" onClick={() => setOpen(true)}>
              Comp this seat
            </Button>
            <p className="ml-auto text-[12px] text-[var(--text-dim)]">
              Admitted, no seat taken yet
              {priceCents !== null && <> &mdash; would be ${(priceCents / 100).toFixed(0)}</>}. A
              comp makes them a member immediately and records you as the one who did it.
            </p>
          </>
        )}
      </div>
    </form>
  );
}
