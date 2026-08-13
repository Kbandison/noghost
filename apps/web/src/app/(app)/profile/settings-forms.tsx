"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { NotificationPrefs } from "@/lib/settings";
import { deleteAccount, saveNotificationPrefs, setPaused, type SettingsState } from "./actions";

const initial: SettingsState = {};

/**
 * Notification preferences.
 *
 * Every row says what it actually controls rather than naming a channel. "Push"
 * means nothing on its own; "the 8pm drop landed" is the thing somebody is
 * deciding whether to be told about.
 *
 * The two drop channels are not independent and the copy says so before anyone
 * finds out by being refused. §3.3 bans engagement-bait notifications, which is
 * the other half of this screen's job: the list is short because there is not
 * much this app is allowed to send.
 */
export function NotificationForm({ prefs }: { prefs: NotificationPrefs }) {
  const [state, action, pending] = useActionState(saveNotificationPrefs, initial);

  /*
   * Controlled, for the reason `field.tsx` gives about its select: React 19
   * resets a form after its action runs, and `form.reset()` restores every
   * checkbox from its `defaultChecked` attribute. Uncontrolled, a *rejected*
   * save silently reverted the member's edits — the error told them to change
   * something that had already changed back, and their other edits were gone
   * with it. Holding the values in state survives the reset.
   */
  const [values, setValues] = useState({
    dropPush: prefs.dropPush,
    dropSms: prefs.dropSms,
    fuseWarnings: prefs.fuseWarnings,
    emailUpdates: prefs.emailUpdates,
  });
  const set = (name: keyof typeof values) => (next: boolean) =>
    setValues((current) => ({ ...current, [name]: next }));

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-4">
        <Toggle
          name="dropPush"
          checked={values.dropPush}
          onChange={set("dropPush")}
          label="Tonight's drop, on this device"
          hint="At 8pm, once. Three people, and then nothing until tomorrow."
        />
        <Toggle
          name="dropSms"
          checked={values.dropSms}
          onChange={set("dropSms")}
          label="Tonight's drop, by text"
          hint={
            prefs.smsOptInAt
              ? "You agreed to texts on " +
                new Date(prefs.smsOptInAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                }) +
                ". Standard rates apply; reply STOP any time."
              : "Standard rates apply, and you can turn this off whenever you like. Turning it on is your consent to be texted."
          }
        />
        <Toggle
          name="fuseWarnings"
          checked={values.fuseWarnings}
          onChange={set("fuseWarnings")}
          label="When a chat is running out of time"
          hint="At 48 and 24 hours left. Never more often than that."
        />
        <Toggle
          name="emailUpdates"
          checked={values.emailUpdates}
          onChange={set("emailUpdates")}
          label="Season email"
          hint="Start, mid-season, finale. Not marketing."
        />
      </div>

      <p className="text-[14px] leading-relaxed text-[var(--text-dim)]">
        Keep at least one of the two drop options on. Everything about a chat that has already
        started &mdash; a closing note, an answer to your connect &mdash; reaches you either way;
        those are the product working, not notifications.
      </p>

      {state.error && (
        <p role="alert" className="text-[15px] leading-snug text-[var(--error)]">
          {state.error}
        </p>
      )}
      {state.saved && !state.error && (
        <p role="status" className="text-[15px] text-[var(--success)]">
          Saved.
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

function Toggle({
  name,
  label,
  hint,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  /*
   * The second half of surviving React 19's post-action form reset, and the
   * half that is easy to miss.
   *
   * Holding the value in state is not enough: `form.reset()` runs outside
   * React's knowledge and puts the DOM checkbox back to its attribute, and
   * because the state did not change there is no re-render to reconcile it
   * back. So the box visibly flips even though the value React will submit did
   * not. `field.tsx` re-asserts its select the same way, for the same reason;
   * this effect runs in the commit right after the reset.
   */
  useEffect(() => {
    if (ref.current && ref.current.checked !== checked) ref.current.checked = checked;
  });

  return (
    <div className="flex gap-3">
      <input
        type="checkbox"
        id={name}
        name={name}
        ref={ref}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-[18px] w-[18px] shrink-0 cursor-pointer accent-[var(--accent)]"
      />
      <label htmlFor={name} className="cursor-pointer">
        <span className="block text-[16px]">{label}</span>
        <span className="mt-0.5 block text-[14px] leading-snug text-[var(--text-dim)]">{hint}</span>
      </label>
    </div>
  );
}

/**
 * Pausing — §6.4.
 *
 * Said as what it does rather than as a warning, because it is not a dangerous
 * action: nothing is lost, the season keeps going, and it is one click back.
 * The line about open chats is the part people would otherwise assume wrongly —
 * pausing is not a way to disappear from a conversation you are already in.
 */
export function PauseForm({ paused }: { paused: boolean }) {
  const [state, action, pending] = useActionState(setPaused, initial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="paused" value={paused ? "no" : "yes"} />

      <p className="text-[16px] leading-relaxed text-[var(--text-secondary)]">
        {paused
          ? "Your account is paused. No drops, and nobody sees you in theirs. Unpause whenever you want the season back — you haven't lost any of it."
          : "Pausing stops your drops and takes you out of everyone else's. Chats you already have stay open: the people in them are still owed an answer, and pausing is not a way to leave without one."}
      </p>

      {state.error && (
        <p role="alert" className="text-[15px] leading-snug text-[var(--error)]">
          {state.error}
        </p>
      )}

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "…" : paused ? "Unpause my account" : "Pause my account"}
      </Button>
    </form>
  );
}

/**
 * Deleting an account.
 *
 * Behind a disclosure and then behind a typed word. Everything else on this page
 * is one button because everything else is reversible; this is the only thing
 * here that cannot be undone, and the confirmation has to be something a
 * mis-tap cannot produce.
 *
 * What happens is listed before the field, in the order it happens, and it says
 * what *stays* as well as what goes. Somebody deciding this is entitled to know
 * that the person they were mid-conversation with will get an ending rather
 * than a disappearance — that is the promise the whole product is built on, and
 * it does not stop applying to the person leaving.
 */
export function DeleteForm() {
  const [state, action, pending] = useActionState(deleteAccount, initial);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[15px] text-[var(--text-dim)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--error)]"
      >
        Delete my account
      </button>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <p className="text-[16px] leading-relaxed text-[var(--text-secondary)]">
        This can&rsquo;t be undone, and it happens straight away.
      </p>

      <ul className="space-y-2 text-[16px] leading-relaxed text-[var(--text-secondary)]">
        <li>
          Every conversation you have open <strong className="font-semibold">closes with a
          note</strong> to the other person &mdash; the same neutral one the app sends when it
          closes a chat itself. They&rsquo;re told it ended, not why, and not that it was you.
        </li>
        <li>Your name, photos, prompts, voice, phone number and verification selfie are erased.</li>
        <li>
          What you wrote in those chats is replaced. The other person keeps their own words and
          the ending; they don&rsquo;t keep yours.
        </li>
        <li>
          Your payment record stays, with nothing personal attached to it. It&rsquo;s what a
          refund would be worked out from.
        </li>
      </ul>

      <div>
        <label
          htmlFor="confirm-delete"
          className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]"
        >
          Type <strong className="font-semibold normal-case tracking-normal">delete</strong> to
          confirm
        </label>
        <input
          id="confirm-delete"
          name="confirm"
          autoComplete="off"
          className="mt-2 w-full max-w-[16rem] rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-[16px] focus:border-[var(--error)] focus:outline-none"
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
          {pending ? "Deleting…" : "Delete my account"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[15px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4"
        >
          Keep my account
        </button>
      </div>
    </form>
  );
}
