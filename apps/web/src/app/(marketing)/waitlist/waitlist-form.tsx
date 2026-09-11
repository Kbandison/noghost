"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { joinWaitlist, type WaitlistState } from "./actions";

const initial: WaitlistState = { status: "idle" };

/**
 * Every state the form can be in is designed: pending, error, and success
 * (LUXWEB quality gate — loading, empty, error, success for all dynamic
 * content). Errors render inline and are announced.
 */
/*
 * No default city.
 *
 * It used to prefill "Atlanta", which is the one answer this form does not want:
 * the whole question is where somebody is when it is somewhere we are not yet,
 * and a prefilled field is the field most people leave alone.
 */
export function WaitlistForm() {
  const [state, formAction, isPending] = useActionState(joinWaitlist, initial);

  if (state.status === "success") {
    return (
      <div className="border border-[var(--border)] bg-[var(--bg-tertiary)] p-8">
        <p className="font-[family-name:var(--font-display)] text-[24px] font-bold tracking-[-0.02em]">
          Done.
        </p>
        <p className="mt-3 text-[16px] leading-relaxed text-[var(--text-secondary)]">
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="border border-[var(--border)] bg-[var(--bg-tertiary)] p-8">
      <div className="space-y-6">
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
        />
        <Field
          label="City"
          name="city"
          type="text"
          autoComplete="address-level2"
          required
        />
      </div>

      {state.status === "error" && (
        <p role="alert" className="mt-5 text-[15px] text-[var(--error)]">
          {state.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="mt-8 w-full">
        {isPending ? "Adding you…" : "Join the waitlist"}
      </Button>
    </form>
  );
}

function Field({
  label,
  name,
  ...props
}: React.ComponentProps<"input"> & { label: string; name: string }) {
  return (
    <div>
      <label
        htmlFor={name}
        className="mb-2 block text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]"
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        {...props}
        className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-[16px] text-[var(--text-primary)] transition-colors placeholder:text-[var(--n-400)] focus:border-[var(--accent)] focus:outline-none"
      />
    </div>
  );
}
