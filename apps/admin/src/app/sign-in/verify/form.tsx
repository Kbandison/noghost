"use client";

import { useActionState } from "react";
import { Button, Field } from "@/components/ui";
import { verifyTotp, type VerifyState } from "../actions";

const initial: VerifyState = {};

export function VerifyForm() {
  const [state, action, pending] = useActionState(verifyTotp, initial);

  return (
    <form action={action} className="space-y-5">
      <Field
        id="code"
        label="Authentication code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="000000"
        required
        autoFocus
        error={state.error}
        className="tabular text-center font-[family-name:var(--font-display)] text-[26px] tracking-[0.4em]"
      />
      <Button type="submit" tone="primary" disabled={pending} className="w-full">
        {pending ? "Verifying…" : "Verify"}
      </Button>
    </form>
  );
}
