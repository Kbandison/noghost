import Link from "next/link";
import { BRAND } from "@noghost/config";

/**
 * Sign-in chrome. Its own route group, outside `(app)`, and that is structural
 * rather than tidy: the member layout calls `requireMember()`, which redirects
 * a signed-out visitor to `/sign-in`. Under that layout this page would
 * redirect to itself forever.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="border-b border-[var(--border-subtle)]">
        <div className="mx-auto flex h-16 w-full max-w-[var(--content-max)] items-center px-6 md:px-8">
          <Link
            href="/"
            className="font-[family-name:var(--font-display)] text-[22px] font-extrabold tracking-[-0.03em]"
          >
            {BRAND.APP_NAME}
          </Link>
        </div>
      </header>

      <main id="main" className="flex flex-1 items-center justify-center px-6 py-16">
        {children}
      </main>
    </div>
  );
}
