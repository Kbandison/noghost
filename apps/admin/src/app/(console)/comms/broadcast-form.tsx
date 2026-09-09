"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import type { SeasonChoice } from "@/lib/comms";
import { sendBroadcast, type BroadcastState } from "./actions";

const initial: BroadcastState = {};
const LIMIT = 1000;

/**
 * The broadcast composer.
 *
 * The recipient count sits on the button rather than in a confirm dialog. A
 * dialog asking "are you sure?" is answered yes by reflex; a button that reads
 * "Send to 287 people" makes the size of the thing unavoidable at the moment of
 * pressing it, which is the only moment it matters.
 */
export function BroadcastForm({ seasons }: { seasons: SeasonChoice[] }) {
  const [seasonId, setSeasonId] = useState(seasons[0]?.id ?? "");
  const [body, setBody] = useState("");

  /*
   * React 19 resets a form once its action has run, which for a sent broadcast
   * is what we want — an empty box rather than the message that already went.
   * The controlled value is cleared here, inside the action, because doing it
   * during render to "match" the reset input is the cascading-render pattern
   * the lint rule next door exists to stop.
   */
  const [state, action, pending] = useActionState(
    async (prev: BroadcastState, formData: FormData) => {
      const result = await sendBroadcast(prev, formData);
      if (result.sent !== undefined && !result.error) setBody("");
      return result;
    },
    initial,
  );

  const season = seasons.find((s) => s.id === seasonId);
  const over = body.length > LIMIT;

  if (seasons.length === 0) {
    return <p className="text-[14px] text-[var(--text-dim)]">There are no seasons to send to.</p>;
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label
          htmlFor="broadcast-season"
          className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--text-dim)]"
        >
          Season
        </label>
        <select
          id="broadcast-season"
          name="seasonId"
          value={seasonId}
          onChange={(event) => setSeasonId(event.target.value)}
          className="w-full rounded-[3px] border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[15px]"
        >
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.phase.replace(/_/g, " ")} · {s.members}{" "}
              {s.members === 1 ? "member" : "members"}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <label
            htmlFor="broadcast-body"
            className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--text-dim)]"
          >
            Announcement
          </label>
          <span className={`text-[12px] ${over ? "text-[var(--error)]" : "text-[var(--text-dim)]"}`}>
            {body.length} / {LIMIT}
          </span>
        </div>
        <textarea
          id="broadcast-body"
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={5}
          placeholder="The finale venue is booked — details on Friday."
          className="w-full rounded-[3px] border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[15px] leading-relaxed"
        />
        <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-dim)]">
          Your words, not a template — this is the one message the copy library doesn&rsquo;t
          write. It is recorded in the audit trail in full.
        </p>
      </div>

      <label className="flex items-start gap-2.5 text-[14px]">
        <input type="checkbox" name="email" className="mt-0.5" />
        <span>
          Also email it
          <span className="block text-[12px] text-[var(--text-dim)]">
            Members who turned off email updates still won&rsquo;t get it — a broadcast is an
            update, and that switch is what it is for.
          </span>
        </span>
      </label>

      {state.error && (
        <p role="alert" className="text-[13px] leading-snug text-[var(--error)]">
          {state.error}
        </p>
      )}
      {state.sent !== undefined && !state.error && (
        <p role="status" className="text-[13px] text-[var(--sage-text)]">
          Queued for {state.sent} {state.sent === 1 ? "person" : "people"}. The next
          notification-sweep delivers it.
        </p>
      )}

      <Button type="submit" tone="primary" disabled={pending || over || body.trim().length === 0}>
        {pending
          ? "Sending…"
          : `Send to ${season?.members ?? 0} ${season?.members === 1 ? "person" : "people"}`}
      </Button>
    </form>
  );
}
