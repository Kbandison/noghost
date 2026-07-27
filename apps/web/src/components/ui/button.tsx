import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/utils";

/**
 * One radius across the project (COMPONENTS.md button rules). Editorial
 * Refined takes the subtle option, not the pill — a magazine doesn't round
 * its corners off.
 */
const base =
  "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md px-7 py-3 " +
  "text-[15px] font-medium transition-all duration-300 " +
  "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--accent-text)]";

const variants = {
  /** Ochre fill with ink text — 4.68:1, the only AA-passing combination. */
  primary:
    "bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-hover)] " +
    "hover:-translate-y-px active:translate-y-0",
  secondary:
    "border border-[var(--border)] bg-transparent text-[var(--text-primary)] " +
    "hover:border-[var(--text-primary)] hover:-translate-y-px active:translate-y-0",
  quiet:
    "px-0 text-[var(--accent-text)] underline decoration-[1.5px] underline-offset-4 " +
    "hover:decoration-[2.5px] min-h-0",
} as const;

type Variant = keyof typeof variants;

export function ButtonLink({
  href,
  variant = "primary",
  className,
  children,
}: {
  href: Route | string;
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href as Route} className={cn(base, variants[variant], className)}>
      {children}
    </Link>
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ComponentProps<"button"> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={cn(base, variants[variant], "disabled:opacity-50", className)}
    />
  );
}
