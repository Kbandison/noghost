import Link from "next/link";
import { BRAND } from "@noghost/config";
import { requireMember } from "@/lib/member";
import { unansweredCount } from "@/lib/inbox";
import { pendingWarning } from "@/lib/warnings";
import { pendingBroadcasts } from "@/lib/broadcasts";
import { WarningScreen } from "@/components/warning/warning-screen";
import { BroadcastBanner } from "@/components/broadcast/broadcast-banner";
import { signOut } from "./actions";
import { AppNav } from "./app-nav";

/**
 * Member app chrome.
 *
 * Deliberately thin. Tonight is Focus Mode — one profile fills the view (see
 * docs/design-decisions.md) — and chrome that competes with the person you are
 * reading is chrome working against the product.
 *
 * All four of §7.2's tabs exist now. Profile is last and carries no count —
 * nothing in settings is ever waiting on you, and a badge there would be the
 * engagement bait §3.3 bans.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await requireMember();
  /*
   * `openChatCount` used to be a fourth query here and is gone.
   *
   * It fed `muted: chats === 0` on the Chats tab — a property no className ever
   * read — beside a hardcoded `count: 0` that meant the badge could not render
   * either. So it was a database round trip on every member page load feeding
   * two dead properties. Removed rather than wired up, because the reason the
   * tab has no badge is deliberate and documented in `AppNav`: an open chat is
   * not a task you owe somebody, and a number on it would turn the fuse into a
   * nag.
   */
  const [waiting, warning, broadcasts] = await Promise.all([
    unansweredCount(member.id),
    pendingWarning(),
    pendingBroadcasts(),
  ]);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="border-b border-[var(--border-subtle)]">
        <div className="mx-auto flex h-16 w-full max-w-[var(--content-max)] items-center justify-between gap-3 px-5 md:gap-6 md:px-8">
          <Link
            href="/tonight"
            className="font-[family-name:var(--font-display)] text-[22px] font-extrabold tracking-[-0.03em]"
          >
            {BRAND.APP_NAME}
          </Link>

          {/* Inline from `md` up; below that the same tabs render as a fixed
              bottom bar, outside this row. */}
          <AppNav waiting={waiting} />

          <div className="flex items-center gap-5">
            {/*
              * `md`, not `sm`.
              *
              * At `sm` (640px) the name still shared the row with four tabs and
              * pushed Sign out past the right edge, so on a phone there was no
              * way to sign out. The name is the least load-bearing thing here —
              * a member knows who they are — so it is the first thing to go.
              */}
            <span className="hidden text-[15px] text-[var(--text-secondary)] md:inline">
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

      {/*
        Below the header and above everything else, but only when there is not a
        warning — a member being told they broke the standards should not have
        an announcement about the finale sitting on top of it.
      */}
      {!warning && <BroadcastBanner broadcasts={broadcasts} />}

      {/* Clears the fixed bottom bar, which would otherwise sit on top of the
          last ~56px of every screen — including the primary button at the end
          of a form. Zero from `md` up, where the bar is not rendered. */}
      <main id="main" className="flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {/*
          In the layout so it cannot be routed around. A warning shown on one
          screen is a warning avoided by opening a different one, and the nav
          above stays — signing out or reading the standards should not require
          acknowledging anything first.
        */}
        {warning ? (
          <WarningScreen id={warning.id} category={warning.category} />
        ) : (
          children
        )}
      </main>

      {/*
        * Outside <main> and after it, so the tab order reaches the content
        * before the navigation a member has already used to get here.
        *
        * Rendered even while a warning is showing: the header comment says
        * signing out or reading the standards must not require acknowledging
        * anything first, and on a phone these tabs ARE that escape route.
        */}
      <AppNav waiting={waiting} layout="bottom" />
    </div>
  );
}
