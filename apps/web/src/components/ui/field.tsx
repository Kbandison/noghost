"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Form primitives for the application funnel.
 *
 * Every control has a real `<label>`, every error is announced, and errors sit
 * next to the field they belong to rather than in a summary at the top. The
 * funnel is the longest form in the product and the one people abandon.
 */

const controlBase =
  "w-full rounded-md border bg-[var(--bg-primary)] px-4 py-3 text-[16px] text-[var(--text-primary)] " +
  "transition-colors placeholder:text-[var(--n-400)] focus:outline-none";

function borderFor(error?: string) {
  return error
    ? "border-[var(--error)] focus:border-[var(--error)]"
    : "border-[var(--border)] focus:border-[var(--accent)]";
}

export function Label({
  htmlFor,
  children,
  hint,
}: {
  htmlFor: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-4">
      <label
        htmlFor={htmlFor}
        className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]"
      >
        {children}
      </label>
      {hint && <span className="text-[13px] text-[var(--text-dim)]">{hint}</span>}
    </div>
  );
}

export function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-2 text-[14px] leading-snug text-[var(--error)]">
      {children}
    </p>
  );
}

export function TextField({
  label,
  hint,
  error,
  className,
  ...props
}: React.ComponentProps<"input"> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...props}
        className={cn(controlBase, borderFor(error), className)}
      />
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

/**
 * Controlled on purpose, unlike the other fields here.
 *
 * React 19 resets an uncontrolled form after its action runs. `form.reset()`
 * restores each control from its HTML *attributes* — and while React writes a
 * real `value` attribute for `defaultValue` on an input, it expresses a
 * select's default by setting the matching option's `selected` *property*.
 * Reset doesn't see that, so an uncontrolled select silently snaps back to its
 * placeholder on every validation error. Holding the value in state survives it.
 */
export function SelectField({
  label,
  hint,
  error,
  children,
  className,
  defaultValue,
  onChange,
  ...props
}: React.ComponentProps<"select"> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  const errorId = `${id}-error`;
  const [value, setValue] = useState(String(defaultValue ?? ""));
  const ref = useRef<HTMLSelectElement>(null);

  // `form.reset()` runs outside React's knowledge and, finding no option with
  // a `selected` attribute, drops the select onto its first enabled option.
  // React won't re-sync a controlled select on its own, so re-assert here —
  // this effect runs in the commit right after the reset.
  useEffect(() => {
    if (ref.current && ref.current.value !== value) ref.current.value = value;
  });

  return (
    <div>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      <select
        id={id}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onChange?.(e);
        }}
        {...props}
        className={cn(controlBase, borderFor(error), "appearance-none pr-10", className)}
      >
        {children}
      </select>
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

export function TextArea({
  label,
  hint,
  error,
  className,
  ...props
}: React.ComponentProps<"textarea"> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...props}
        className={cn(controlBase, borderFor(error), "min-h-28 resize-y leading-relaxed", className)}
      />
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

/**
 * A selectable chip. Used for gender, seeking, and interests — the real input
 * is a visually-hidden checkbox or radio, so keyboard and screen-reader
 * behaviour is the native one.
 */
export function Chip({
  name,
  value,
  label,
  type = "checkbox",
  defaultChecked,
  disabled,
}: {
  name: string;
  value: string;
  label: string;
  type?: "checkbox" | "radio";
  defaultChecked?: boolean;
  disabled?: boolean;
}) {
  const id = useId();

  return (
    <div className="contents">
      <input
        type={type}
        id={id}
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className={cn(
          "cursor-pointer select-none rounded-md border border-[var(--border)] px-4 py-2 text-[15px]",
          "transition-all duration-150 hover:border-[var(--text-dim)]",
          "peer-checked:border-[var(--accent)] peer-checked:bg-[var(--accent)] peer-checked:text-[var(--on-accent)]",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent-text)]",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-40",
        )}
      >
        {label}
      </label>
    </div>
  );
}

export function CheckboxRow({
  name,
  error,
  children,
  defaultChecked,
}: {
  name: string;
  error?: string;
  children: React.ReactNode;
  defaultChecked?: boolean;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div>
      <div className="flex gap-3">
        <input
          type="checkbox"
          id={id}
          name={name}
          defaultChecked={defaultChecked}
          aria-describedby={error ? errorId : undefined}
          className="mt-1 h-[18px] w-[18px] shrink-0 cursor-pointer accent-[var(--accent)]"
        />
        <label htmlFor={id} className="cursor-pointer text-[15px] leading-relaxed text-[var(--text-secondary)]">
          {children}
        </label>
      </div>
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}
