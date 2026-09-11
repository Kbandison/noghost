import Link from "next/link";
import type { Route } from "next";
import { BRAND } from "@noghost/config";
import { LEGAL_LINKS } from "@noghost/config/copy";
import { Ghost } from "@/components/ui/ghost";

/**
 * Functional, not decorative (COMPONENTS.md footer rules). No newsletter form —
 * the waitlist has its own page, and this brand doesn't harvest addresses at
 * the bottom of a page.
 */
export function Footer({ seasonName }: { seasonName: string }) {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--bg-secondary)]">
      <div className="mx-auto w-full max-w-[var(--content-max)] px-6 py-16 md:px-8">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xs">
            <div className="mb-4 flex items-center gap-3">
              <Ghost className="h-8 w-8 text-[var(--accent)]" />
              <span className="font-[family-name:var(--font-display)] text-xl font-extrabold tracking-[-0.03em]">
                {BRAND.APP_NAME}
              </span>
            </div>
            <p className="text-[15px] leading-relaxed text-[var(--text-secondary)]">
              {BRAND.PITCH}
            </p>
          </div>

          <nav aria-label="Footer" className="flex gap-14">
            <div>
              <h2 className="mb-4 text-[13px] font-medium uppercase tracking-[0.14em] text-[var(--text-dim)]">
                {seasonName}
              </h2>
              <ul className="space-y-3 text-[15px]">
                <li>
                  <FooterLink href="/how-it-works">How it works</FooterLink>
                </li>
                <li>
                  <FooterLink href="/faq">FAQ</FooterLink>
                </li>
                <li>
                  <FooterLink href="/apply">Apply</FooterLink>
                </li>
                <li>
                  <FooterLink href="/waitlist">Other cities</FooterLink>
                </li>
              </ul>
            </div>

            <div>
              <h2 className="mb-4 text-[13px] font-medium uppercase tracking-[0.14em] text-[var(--text-dim)]">
                Legal
              </h2>
              <ul className="space-y-3 text-[15px]">
                {LEGAL_LINKS.map((link) => (
                  <li key={link.href}>
                    <FooterLink href={link.href}>{link.label}</FooterLink>
                  </li>
                ))}
                <li>
                  <a
                    href={`mailto:${BRAND.SUPPORT_EMAIL}`}
                    className="text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                  >
                    Contact
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-8 text-[14px] text-[var(--text-dim)] md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {BRAND.APP_NAME}.
          </p>
          <p>{BRAND.TAGLINE}</p>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href as Route}
      className="text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
    >
      {children}
    </Link>
  );
}
