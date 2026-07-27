import { cn } from "@/lib/utils";

/**
 * The section wrapper. DENSITY 3 padding and a 1040px measure come from the
 * tokens, so a dial change moves every section at once.
 *
 * Sections sit flush against each other — separation comes from a background
 * shift or a hairline rule, never from empty space (LUXWEB spacing rules).
 */
export function Section({
  children,
  className,
  /**
   * Applied to the measure-constrained container, not the full-bleed section.
   * Anything spacing the children (`space-y-*`, `grid`) belongs here — on the
   * outer element it would apply to a single wrapper div and do nothing.
   */
  innerClassName,
  tone = "page",
  id,
  /**
   * `content-visibility: auto` for sections with no scroll-triggered content.
   *
   * Off by default, and it must stay off wherever `Reveal` is used: the
   * `contain-intrinsic-size` placeholder height makes ScrollTrigger compute
   * positions against geometry that doesn't match the real layout, the trigger
   * never fires, and GSAP's opacity:0 start state becomes permanent — a blank
   * section. The paint saving is not worth a page that can hide itself.
   */
  deferPaint = false,
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  tone?: "page" | "sunken" | "raised";
  id?: string;
  deferPaint?: boolean;
}) {
  const tones = {
    page: "bg-[var(--bg-primary)]",
    sunken: "bg-[var(--bg-secondary)]",
    raised: "bg-[var(--bg-tertiary)]",
  } as const;

  return (
    <section
      id={id}
      className={cn(
        "relative overflow-hidden py-[var(--section-py)]",
        tones[tone],
        deferPaint && "cv-auto",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto w-full max-w-[var(--content-max)] px-6 md:px-8",
          innerClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** Small uppercase eyebrow. The one place letter-spacing goes positive. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "block text-[13px] font-medium uppercase tracking-[0.14em] text-[var(--accent-text)]",
        className,
      )}
    >
      {children}
    </span>
  );
}
