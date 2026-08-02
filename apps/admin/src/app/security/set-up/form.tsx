"use client";

import { useActionState } from "react";
import { Button, Field } from "@/components/ui";
import { enrolAction, type EnrolState } from "./actions";

/** Lives here because a "use server" module may only export async functions. */
const initial: EnrolState = { stage: "idle" };

export function EnrolForm() {
  const [state, action, pending] = useActionState<EnrolState, FormData>(enrolAction, initial);

  if (state.stage === "idle") {
    return (
      <form action={action} className="space-y-5">
        <input type="hidden" name="intent" value="begin" />
        {state.error && (
          <p role="alert" className="text-[14px] leading-snug text-[var(--error)]">
            {state.error}
          </p>
        )}
        <Button type="submit" tone="primary" disabled={pending} className="w-full">
          {pending ? "Preparing…" : "Set up authenticator"}
        </Button>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="intent" value="confirm" />
      <input type="hidden" name="factorId" value={state.factorId ?? ""} />

      <div className="flex justify-center border border-[var(--border)] bg-[var(--bg-primary)] p-5">
        {/*
         * A data URL rather than dangerouslySetInnerHTML. The markup is
         * Supabase's, but an <img> gives it its own document context, so even a
         * malformed SVG can't reach the console's DOM or run script against an
         * authenticated admin session. Built server-side — see `qrDataUrl`.
         */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={state.qr ?? ""}
          alt="QR code for enrolling this console in your authenticator app"
          width={190}
          height={190}
        />
      </div>

      <div>
        <p
          id="totp-secret-label"
          className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--text-dim)]"
        >
          Can&rsquo;t scan? Enter this key
        </p>
        <p
          id="totp-secret"
          aria-labelledby="totp-secret-label"
          className="tabular mt-1.5 break-all rounded-[3px] border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[13px]"
        >
          {state.secret}
        </p>
      </div>

      <Field
        id="code"
        label="Code from the app"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="000000"
        required
        error={state.error}
        className="tabular text-center font-[family-name:var(--font-display)] text-[26px] tracking-[0.4em]"
      />

      <Button type="submit" tone="primary" disabled={pending} className="w-full">
        {pending ? "Confirming…" : "Confirm and finish"}
      </Button>
    </form>
  );
}
