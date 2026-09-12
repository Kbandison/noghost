import Link from "next/link";
import type { Route } from "next";
import { BRAND } from "@noghost/config";
import { requireMember } from "@/lib/member";
import { unansweredCount } from "@/lib/inbox";
import { chatsTabState } from "@/lib/chats";
import { pendingWarning } from "@/lib/warnings";
import { pendingBroadcasts } from "@/lib/broadcasts";
import { WarningScreen } from "@/components/warning/warning-screen";
import { BroadcastBanner } from "@/components/broadcast/broadcast-banner";
import { signOut } from "./actions";
import { AppNav } from "./app-nav";
import { BellIcon, SettingsIcon, SignOutIcon } from "./nav-icons";
import { LiveRefresh } from "@/components/live/live-refresh";

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
/** An icon that goes somewhere, named for anybody who cannot see it. */
function IconLink({
  href,
  label,
  children,
}: {
  /*
   * `Route`, not a union of the two literals. `typedRoutes` makes `Link`
   * generic over its href, and a union widens that generic to something it
   * cannot satisfy — the error names `LinkProps<"/notifications">` and looks
   * like the route is missing rather than like a typing mismatch.
   */
  href: Route;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
    >
      {children}
    </Link>
  );
}

export default async function AppLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  /**
   * The `@modal` parallel slot — empty on nearly every render, and holding an
   * intercepted note or conversation when one was opened from the list.
   * Declared here because a slot no layout renders is a slot that never
   * appears, and the interception would silently do nothing.
   *
   * Optional, and not because it might be absent at runtime — Next always
   * passes it here. `(app)` and `(apply)` are both root route groups, so both
   * layouts are typed against the same generated `LayoutProps<"/">`, and that
   * type cannot carry a slot only one of them has. Requiring it fails
   * typegen validation for a prop that is always supplied.
   */
  modal?: React.ReactNode;
}) {
  const member = await requireMember();
  const now = new Date().toISOString();
  const [waiting, chats, warning, broadcasts] = await Promise.all([
    unansweredCount(member.id),
    chatsTabState(member.id, now),
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
          <AppNav waiting={waiting} chats={chats.count} chatUrgency={chats.urgency} />

          {/*
            * Three icons, and the reason they are icons is that the words did
            * not fit. "Sign out" alone shared this row with the tabs and the
            * member's name; adding "Notifications" and "Settings" as words
            * would have taken more width than the tabs themselves.
            *
            * Each carries a visible tooltip via `title` and an `aria-label`,
            * because an icon on its own is a guess for anybody who has not met
            * it before — and two of these three go somewhere, while the third
            * ends the session.
            */}
          <div className="flex items-center gap-1">
            {/*
              * `md`, not `sm`. At 640px the name still shared the row with the
              * tabs and pushed the controls past the right edge. The name is
              * the least load-bearing thing here — a member knows who they are.
              */}
            <span className="mr-2 hidden text-[15px] text-[var(--text-secondary)] md:inline">
              {member.firstName}
            </span>

            {/*
              * The record of what was sent. Push is the one channel that leaves
              * no copy anywhere — dismissed from a lock screen and it is gone —
              * so this exists to be the copy. Carries no count: §3.3 bans
              * engagement bait, and a number on a log of things that already
              * happened is exactly that. See `notifications/page.tsx`.
              */}
            <IconLink href="/notifications" label="Notifications">
              <BellIcon className="h-5 w-5" />
            </IconLink>

            <IconLink href="/profile" label="Settings">
              <SettingsIcon className="h-5 w-5" />
            </IconLink>

            <form action={signOut} className="contents">
              <button
                type="submit"
                title="Sign out"
                aria-label="Sign out"
                className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
              >
                <SignOutIcon className="h-5 w-5" />
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
      {/*
        * One subscription for the whole member app, in the layout because the
        * badge is.
        *
        * It was on the conversation screen only, which meant a message arriving
        * while somebody sat in the Inbox changed nothing — the badge is
        * rendered here, and nothing here was listening. `router.refresh()`
        * re-runs the entire current route, so this one subscription updates the
        * badge, the list behind it and any conversation open over it.
        *
        * Unfiltered, because RLS is the filter: `messages` is
        * `is_chat_participant(chat_id)`, so a member is sent their own chats
        * and no others whatever this subscribes to.
        */}
      <LiveRefresh table="messages" event="INSERT" />

      {/* Outside <main> and before the nav: a dialog is not part of the
          document's reading order, and `showModal()` moves focus into it. */}
      {modal}

      <AppNav
        waiting={waiting}
        chats={chats.count}
        chatUrgency={chats.urgency}
        layout="bottom"
      />
    </div>
  );
}
