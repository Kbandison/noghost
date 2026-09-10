"use client";

import { useActionState } from "react";
import { Button, Field } from "@/components/ui";
import { requestReset, setPassword, type ResetState } from "../sign-in/reset-actions";

const initial: ResetState = {};

/** Ask for a link. Deliberately says the same thing whatever the address is. */
export function RequestForm() {
  const [state, action, pending] = useActionState(requestReset, initial);

  if (state.sent) {
    return (
      <p className="text-[15px] leading-relaxed text-[var(--text-secondary)]">
        If that address can open the console, a reset link is on its way. It expires in an hour.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <Field
        id="email"
        label="Email"
        name="email"
        type="email"
        autoComplete="username"
        required
        autoFocus
        error={state.error}
      />
      <Button type="submit" tone="primary" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Email me a link"}
      </Button>
    </form>
  );
}

/** Set the new one. Only reachable with a recovery session already established. */
export function SetForm() {
  const [state, action, pending] = useActionState(setPassword, initial);

  if (state.sent) {
    return (
      <div className="space-y-5">
        <p className="text-[15px] leading-relaxed text-[var(--sage-text)]">
          Password changed. Your authenticator code is still needed to get in.
        </p>
        <Button
          type="button"
          tone="primary"
          className="w-full"
          onClick={() => {
            window.location.href = "/sign-in";
          }}
        >
          Sign in
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <Field
        id="password"
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="12 characters or more"
        required
        autoFocus
      />
      <Field
        id="confirm"
        label="Again"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        error={state.error}
      />
      <Button type="submit" tone="primary" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}
