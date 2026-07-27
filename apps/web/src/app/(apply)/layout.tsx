import Link from "next/link";
import { BRAND } from "@noghost/config";

/**
 * Funnel chrome: the wordmark and a way out. No nav, no footer.
 *
 * A five-step form is the wrong place to offer someone the FAQ — the exit is
 * there so nobody feels trapped, and nothing else is.
 */
export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="border-b border-[var(--border-subtle)]">
        <div className="mx-auto flex h-16 w-full max-w-[var(--content-max)] items-center justify-between px-6 md:px-8">
          <Link
            href="/"
            className="font-[family-name:var(--font-display)] text-[22px] font-extrabold tracking-[-0.03em]"
          >
            {BRAND.APP_NAME}
          </Link>
          <Link
            href="/"
            className="text-[15px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            Save and exit
          </Link>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}
