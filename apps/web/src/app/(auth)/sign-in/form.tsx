"use client";

import { useActionState } from "react";
import { OTP_MAX_DIGITS } from "@noghost/config";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { requestCode, verifyCode, type SignInState } from "./actions";

/** Lives here because a "use server" module may only export async functions. */
const initial: SignInState = { stage: "phone" };

export function SignInForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>((prev, formData) => {
    const intent = String(formData.get("intent"));
    // Going back to the number field is a UI change, not a request for another
    // code — sending one here would text the number they are trying to correct.
    if (intent === "restart") return { stage: "phone", phone: prev.phone };
    return intent === "verify" ? verifyCode(prev, formData) : requestCode(prev, formData);
  }, initial);

  if (state.stage === "phone") {
    return (
      <form action={action} className="space-y-6">
        <input type="hidden" name="intent" value="request" />
        <TextField
          label="Phone number"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+1 404 555 0123"
          defaultValue={state.phone}
          required
          error={state.error}
        />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Sending…" : "Send my code"}
        </Button>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="intent" value="verify" />
      <input type="hidden" name="phone" value={state.phone ?? ""} />

      {/*
        Says a code was sent, not that an account exists. `requestCode` reaches
        this stage either way on purpose — a page that answered "no account for
        that number" would be a membership lookup anyone could run.
      */}
      <p className="text-[15px] leading-relaxed text-[var(--text-secondary)]">
        If that number is on the list, a code is on its way to{" "}
        <span className="whitespace-nowrap font-medium text-[var(--text-primary)]">
          {state.phone}
        </span>
        .
      </p>

      <TextField
        label="Your code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={OTP_MAX_DIGITS}
        placeholder="000000"
        required
        error={state.error}
        className="text-center font-[family-name:var(--font-display)] text-[28px] tracking-[0.4em]"
      />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Checking…" : "Sign in"}
      </Button>

      <button
        type="submit"
        name="intent"
        value="restart"
        formNoValidate
        className="w-full text-[15px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
      >
        Use a different number
      </button>
    </form>
  );
}
