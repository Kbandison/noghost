"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { NotificationPrefs } from "@/lib/settings";
import { saveNotificationPrefs, setPaused, type SettingsState } from "./actions";

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
