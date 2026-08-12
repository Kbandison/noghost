"use client";

import { useActionState, useState } from "react";
import { DATE_MAX_LEAD_DAYS, DATE_MIN_LEAD_HOURS } from "@noghost/config";
import { Button } from "@/components/ui/button";
import { proposeDate, respondToDate, type ChatActionState } from "../actions";

const initial: ChatActionState = {};

/**
 * "Propose a date" — spec §7.2, the button that is always in the header.
 *
 * The day and time inputs are bounded to §6.3's window: at least two hours out,
 * at most fourteen days. That window is the anti-loophole rule — a date parked
 * far in the future would freeze a fuse indefinitely — and it is checked three
 * times over: `min`/`max` here, `validateDateProposal` in the action, and
 * `propose_date` in SQL. The HTML bounds are the courtesy; the RPC is the rule.
 */
export function DateProposal({ chatId, name }: { chatId: string; name: string }) {
  const [state, action, pending] = useActionState(proposeDate, initial);

  /*
   * The date bounds are computed when the form opens, not during render.
   *
   * `Date.now()` in a render body is impure: the server and the client evaluate
   * it at different moments, so the `min`/`max` attributes disagree across
   * hydration. Stamping them in the click handler makes render deterministic and
   * still reads the member's own clock, which is what "at least two hours from
   * now" has to mean.
   */
  const [bounds, setBounds] = useState<{ min: string; max: string } | null>(null);

  if (!bounds) {
    return (
      <Button
        onClick={() => {
          const day = (ms: number) => new Date(Date.now() + ms).toISOString().slice(0, 10);
          setBounds({
            min: day(DATE_MIN_LEAD_HOURS * 3_600_000),
            max: day(DATE_MAX_LEAD_DAYS * 86_400_000),
          });
        }}
        className="shrink-0"
      >
        Propose a date
      </Button>
    );
  }

  return (
    <div className="absolute inset-x-0 top-full border-b border-[var(--border)] bg-[var(--bg-secondary)] p-6 shadow-lg md:px-10">
      <form action={action} className="mx-auto max-w-[40rem] space-y-5">
        <input type="hidden" name="chatId" value={chatId} />

        <div>
          <h2 className="font-[family-name:var(--font-display)] text-[20px] font-bold tracking-[-0.02em]">
            Put something on the calendar with {name}
          </h2>
          <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--text-secondary)]">
            A real time and a real place. Once they confirm, the seven-day clock pauses until
            you&rsquo;ve met.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
              Day
            </span>
            <input
              type="date"
              name="day"
              required
              min={bounds.min}
              max={bounds.max}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-[16px] focus:border-[var(--accent)] focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
              Time
            </span>
            <input
              type="time"
              name="time"
              required
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-[16px] focus:border-[var(--accent)] focus:outline-none"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
            Where
          </span>
          <input
            name="placeName"
            required
            maxLength={120}
            placeholder="The name of the place"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-[16px] placeholder:text-[var(--n-400)] focus:border-[var(--accent)] focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
            Anything else <span className="font-normal normal-case tracking-normal">optional</span>
          </span>
          <input
            name="placeNote"
            maxLength={200}
            placeholder="“It's the one with the green door.”"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-[16px] placeholder:text-[var(--n-400)] focus:border-[var(--accent)] focus:outline-none"
          />
        </label>

        {state.error && (
          <p role="alert" className="text-[15px] leading-snug text-[var(--error)]">
            {state.error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : `Send it to ${name}`}
          </Button>
          <button
            type="button"
            onClick={() => setBounds(null)}
            className="text-[15px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
          >
            Not now
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Confirm or decline a plan the other person proposed.
 *
 * A separate named export rather than `DateProposal.Respond`. In a `"use client"`
 * module only the *exports* become client references; a property hung off an
 * exported function does not cross the boundary, so the server renders
 * `undefined` and React throws "element type is invalid" at request time —
 * which typecheck and `next build` both pass.
 */
export function RespondToDate({ chatId, dateId }: { chatId: string; dateId: string }) {
  const [state, action, pending] = useActionState(respondToDate, initial);

  return (
    <div className="mt-4">
      {state.error && (
        <p role="alert" className="mb-3 text-[15px] leading-snug text-[var(--error)]">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <form action={action}>
          <input type="hidden" name="chatId" value={chatId} />
          <input type="hidden" name="dateId" value={dateId} />
          <input type="hidden" name="confirm" value="yes" />
          <Button type="submit" disabled={pending}>
            {pending ? "…" : "Yes, that works"}
          </Button>
        </form>

        <form action={action}>
          <input type="hidden" name="chatId" value={chatId} />
          <input type="hidden" name="dateId" value={dateId} />
          <input type="hidden" name="confirm" value="no" />
          <Button type="submit" variant="secondary" disabled={pending}>
            Suggest another time
          </Button>
        </form>
      </div>
      <p className="mt-2 text-[14px] text-[var(--text-dim)]">
        Declining keeps the chat open &mdash; the clock just carries on.
      </p>
    </div>
  );
}
