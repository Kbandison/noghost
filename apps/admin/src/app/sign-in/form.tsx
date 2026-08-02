"use client";

import { useActionState } from "react";
import { Button, Field } from "@/components/ui";
import { signIn, type SignInState } from "./actions";

const initial: SignInState = {};

export function SignInForm() {
  const [state, action, pending] = useActionState(signIn, initial);

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
      />
      <Field
        id="password"
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        // The error sits on the password field because that's where a person
        // looks first, but it covers every failure mode — see actions.ts.
        error={state.error}
      />
      <Button type="submit" tone="primary" disabled={pending} className="w-full">
        {pending ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
