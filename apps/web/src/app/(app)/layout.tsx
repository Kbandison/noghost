import Link from "next/link";
import { BRAND } from "@noghost/config";
import { requireMember } from "@/lib/member";
import { unansweredCount } from "@/lib/inbox";
import { signOut } from "./actions";
import { AppNav } from "./app-nav";

/**
 * Member app chrome.
 *
 * Deliberately thin. Tonight is Focus Mode — one profile fills the view (see
 * docs/design-decisions.md) — and chrome that competes with the person you are
 * reading is chrome working against the product.
 *
 * Two of §7.2's four tabs exist, so two are shown. Chats and Profile arrive
 * with their phases; a tab that leads nowhere is worse than a missing one.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await requireMember();
  const waiting = await unansweredCount(member.id);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="border-b border-[var(--border-subtle)]">
        <div className="mx-auto flex h-16 w-full max-w-[var(--content-max)] items-center justify-between gap-6 px-6 md:px-8">
          <Link
            href="/tonight"
            className="font-[family-name:var(--font-display)] text-[22px] font-extrabold tracking-[-0.03em]"
          >
            {BRAND.APP_NAME}
          </Link>

          <AppNav waiting={waiting} />

          <div className="flex items-center gap-5">
            <span className="hidden text-[15px] text-[var(--text-secondary)] sm:inline">
              {member.firstName}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-[15px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}
