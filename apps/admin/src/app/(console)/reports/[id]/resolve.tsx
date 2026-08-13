"use client";

import { useActionState, useState } from "react";
import { resolve, type ResolveState } from "../actions";

const initial: ResolveState = {};

/**
 * The three outcomes — spec §7.3's "warn/remove member", plus dismissing.
 *
 * Removal is behind a second step and the other two are not. That is not
 * ceremony: it is the only action here that changes somebody's season, closes
 * every conversation they are having, and cannot be undone from this screen.
 * The confirm step is also where the reason is asked for, so the note is
 * written while the reasoning is fresh rather than as an afterthought.
 *
 * What each one does is written next to it rather than assumed. A moderator
 * should not have to remember that dismissing leaves the two of them invisible
 * to each other, or that warning is a screen the member cannot skip rather than
 * a note in a log — both surprise people, and both are deliberate.
 */
export function Resolve({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(resolve, initial);
  const [removing, setRemoving] = useState(false);

  if (removing) {
    return (
      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="resolution" value="removed" />

        <h2 className="font-[family-name:var(--font-display)] text-[20px] font-bold tracking-[-0.02em]">
          Remove {name} from the season?
        </h2>
        <p className="text-[16px] leading-relaxed text-[var(--text-secondary)]">
          Their account becomes <code>removed</code>, they stop appearing in anyone&rsquo;s drop,
          and <strong className="font-semibold">every open chat they have closes</strong> — with
          all their partners, not just this one. Each gets §9.2&rsquo;s neutral note: closed by
          NoGhost, nothing you did.
        </p>

        <div>
          <label
            htmlFor="removal-note"
            className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]"
          >
            Why (internal, goes to the audit trail)
          </label>
          <textarea
            id="removal-note"
            name="note"
            rows={3}
            required
            minLength={3}
            placeholder="What you found, in a sentence."
            className="mt-2 w-full resize-y rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-[15px] leading-relaxed focus:border-[var(--accent)] focus:outline-none"
          />
        </div>

        {state.error && (
          <p role="alert" className="text-[15px] leading-snug text-[var(--error)]">
            {state.error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-[var(--error)] px-5 py-2.5 text-[15px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {pending ? "Removing…" : `Remove ${name}`}
          </button>
          <button
            type="button"
            onClick={() => setRemoving(false)}
            className="text-[15px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4"
          >
            Go back
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="font-[family-name:var(--font-display)] text-[20px] font-bold tracking-[-0.02em]">
        Decide
      </h2>

      {state.error && (
        <p role="alert" className="text-[15px] leading-snug text-[var(--error)]">
          {state.error}
        </p>
      )}

      <div className="space-y-3">
        <Option
          title="Dismiss"
          detail="No action against them. They and the reporter stay invisible to each other — dismissing means nothing happens to the account, not that the reporter was wrong to be uncomfortable."
        >
          <Submit id={id} resolution="dismissed" label="Dismiss" pending={pending} action={action} />
        </Option>

        <Option
          title="Warn"
          detail="Sends them a warning the next time they open the app — it replaces the whole app until they acknowledge it. They're told the category, never who reported them, and never anything from the report itself."
        >
          <Submit id={id} resolution="warned" label="Send a warning" pending={pending} action={action} />
        </Option>

        <Option
          title="Remove"
          detail="Ends their season and closes every chat they have, each with a neutral note. Needs a reason."
        >
          <button
            type="button"
            onClick={() => setRemoving(true)}
            className="rounded-md border border-[var(--error)] px-4 py-2 text-[15px] text-[var(--error)] transition-colors hover:bg-[var(--error)]/10"
          >
            Remove {name}…
          </button>
        </Option>
      </div>
    </div>
  );
}

function Option({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-[var(--border)] p-4">
      <h3 className="text-[16px] font-semibold">{title}</h3>
      <p className="mt-1 text-[15px] leading-relaxed text-[var(--text-secondary)]">{detail}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Submit({
  id,
  resolution,
  label,
  pending,
  action,
}: {
  id: string;
  resolution: string;
  label: string;
  pending: boolean;
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="resolution" value={resolution} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-[var(--border)] px-4 py-2 text-[15px] transition-colors hover:border-[var(--text-dim)] disabled:opacity-40"
      >
        {pending ? "…" : label}
      </button>
    </form>
  );
}
