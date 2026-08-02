import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Admin primitives.
 *
 * Deliberately plainer than the marketing site's. This screen is a working
 * surface, not a piece of writing — the archetype's serif is kept for headings
 * and numbers so it still reads as NoGhost, and everything else gets out of
 * the way.
 */

export const cn = (...parts: unknown[]) => twMerge(clsx(parts));

export function Panel({
  title,
  meta,
  actions,
  children,
  className,
}: {
  title?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("border border-[var(--border)] bg-[var(--bg-tertiary)]", className)}
    >
      {(title || actions) && (
        <header className="flex items-baseline justify-between gap-4 border-b border-[var(--border)] px-4 py-2.5">
          <div className="flex items-baseline gap-3">
            {title && (
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--text-dim)]">
                {title}
              </h2>
            )}
            {meta && <span className="tabular text-[13px] text-[var(--text-dim)]">{meta}</span>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

type ButtonTone = "default" | "primary" | "danger" | "quiet";

const TONES: Record<ButtonTone, string> = {
  default:
    "border-[var(--border)] bg-[var(--bg-primary)] hover:border-[var(--text-dim)] text-[var(--text-primary)]",
  primary:
    "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-hover)] hover:border-[var(--accent-hover)]",
  danger:
    "border-[var(--error)] bg-transparent text-[var(--error)] hover:bg-[var(--error)] hover:text-[var(--bg-primary)]",
  quiet:
    "border-transparent bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-4",
};

export function Button({
  tone = "default",
  className,
  ...props
}: React.ComponentProps<"button"> & { tone?: ButtonTone }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[3px] border px-3.5 py-2 text-[14px] font-medium",
        "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45",
        TONES[tone],
        className,
      )}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: React.ComponentProps<"input"> & { label: string; hint?: string; error?: string }) {
  const errorId = `${id}-error`;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--text-dim)]"
        >
          {label}
        </label>
        {hint && <span className="text-[12px] text-[var(--text-dim)]">{hint}</span>}
      </div>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...props}
        className={cn(
          "w-full rounded-[3px] border bg-[var(--bg-primary)] px-3 py-2 text-[15px] text-[var(--text-primary)]",
          "placeholder:text-[var(--n-400)] focus:outline-none",
          error
            ? "border-[var(--error)] focus:border-[var(--error)]"
            : "border-[var(--border)] focus:border-[var(--accent)]",
          className,
        )}
      />
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-[13px] leading-snug text-[var(--error)]">
          {error}
        </p>
      )}
    </div>
  );
}

const STATUS_TONES: Record<string, string> = {
  under_review: "bg-[var(--fuse-amber)]/15 text-[var(--accent-text)] border-[var(--fuse-amber)]/40",
  admitted: "bg-[var(--sage)]/20 text-[var(--sage-text)] border-[var(--sage)]/50",
  claimed: "bg-[var(--sage)]/30 text-[var(--sage-text)] border-[var(--sage)]",
  waitlisted: "bg-[var(--n-200)] text-[var(--text-secondary)] border-[var(--border)]",
  rejected: "bg-transparent text-[var(--text-dim)] border-[var(--border)]",
  expired: "bg-transparent text-[var(--text-dim)] border-[var(--border-subtle)]",
  applied: "bg-[var(--n-100)] text-[var(--text-secondary)] border-[var(--border-subtle)]",
  phone_verified: "bg-[var(--n-100)] text-[var(--text-secondary)] border-[var(--border-subtle)]",
  selfie_submitted: "bg-[var(--n-100)] text-[var(--text-secondary)] border-[var(--border-subtle)]",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.07em]",
        STATUS_TONES[status] ?? STATUS_TONES.applied,
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

/** A labelled number. The console is mostly these. */
export function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string | number;
  note?: string;
  tone?: "warn" | "good";
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-dim)]">
        {label}
      </p>
      <p
        className={cn(
          "tabular mt-1 font-[family-name:var(--font-display)] text-[26px] font-semibold leading-none tracking-[-0.02em]",
          tone === "warn" && "text-[var(--error)]",
          tone === "good" && "text-[var(--sage-text)]",
        )}
      >
        {value}
      </p>
      {note && <p className="mt-1 text-[12px] leading-snug text-[var(--text-dim)]">{note}</p>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 py-10 text-center text-[14px] text-[var(--text-dim)]">{children}</p>
  );
}
