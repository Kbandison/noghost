import Link from "next/link";
import { BRAND } from "@noghost/config";
import { requireMember } from "@/lib/member";
import { signOut } from "./actions";

/**
 * Member app chrome.
 *
 * Deliberately thin. Tonight is Focus Mode — one profile fills the view (see
 * docs/design-decisions.md) — and chrome that competes with the person you are
 * reading is chrome working against the product.
 *
 * There is no tab bar yet because there is one destination. §7.2's Inbox and
 * Chats tabs arrive with Phase 4; a bar of three links where two lead nowhere
 * would be worse than no bar.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await requireMember();

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="border-b border-[var(--border-subtle)]">
        <div className="mx-auto flex h-16 w-full max-w-[var(--content-max)] items-center justify-between px-6 md:px-8">
          <Link
            href="/tonight"
            className="font-[family-name:var(--font-display)] text-[22px] font-extrabold tracking-[-0.03em]"
          >
            {BRAND.APP_NAME}
          </Link>

          <div className="flex items-center gap-5">
            <span className="text-[15px] text-[var(--text-secondary)]">{member.firstName}</span>
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
