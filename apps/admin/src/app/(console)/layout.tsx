import Link from "next/link";
import { BRAND } from "@noghost/config";
import { requireAdmin } from "@/lib/auth";
import { signOut } from "../sign-in/actions";
import { NavLink } from "./nav-link";

/**
 * The console shell.
 *
 * `requireAdmin()` runs here, but it is not the only place it runs — a layout
 * guard protects rendering, not Server Actions, which a client can invoke
 * directly. Every mutating action re-checks. See admissions/actions.ts.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="flex min-h-dvh">
      <nav
        aria-label="Console"
        className="flex w-[var(--admin-rail)] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)]"
      >
        <div className="border-b border-[var(--border)] px-4 py-4">
          <Link href="/" className="font-[family-name:var(--font-display)] text-[16px] font-extrabold tracking-[-0.02em]">
            {BRAND.APP_NAME}
          </Link>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-dim)]">
            Admin
          </p>
        </div>

        <ul className="flex-1 space-y-0.5 p-2">
          <li>
            <NavLink href="/">Overview</NavLink>
          </li>
          <li>
            <NavLink href="/admissions">Admissions</NavLink>
          </li>
          <li>
            <NavLink href="/reports">Reports</NavLink>
          </li>
          <li>
            <NavLink href="/photos">Photos</NavLink>
          </li>
          <li>
            <NavLink href="/season">Season</NavLink>
          </li>
          <li>
            <NavLink href="/comms">Comms</NavLink>
          </li>
          <li>
            <NavLink href="/audit">Audit trail</NavLink>
          </li>
        </ul>

        <div className="border-t border-[var(--border)] p-3">
          <p className="truncate text-[12px] text-[var(--text-dim)]" title={admin.email}>
            {admin.email}
          </p>
          <form action={signOut}>
            <button
              type="submit"
              className="mt-1.5 text-[13px] text-[var(--text-secondary)] underline underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
            >
              Sign out
            </button>
          </form>
        </div>
      </nav>

      <main id="main" className="min-w-0 flex-1">
        {children}
      </main>
    </div>
  );
}
