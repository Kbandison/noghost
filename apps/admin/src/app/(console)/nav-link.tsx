"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { cn } from "@/components/ui";

export function NavLink({ href, children }: { href: Route; children: React.ReactNode }) {
  const pathname = usePathname();
  // "/" must match exactly or it would light up on every page.
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "block rounded-[3px] px-3 py-2 text-[14px] transition-colors duration-150",
        active
          ? "bg-[var(--bg-tertiary)] font-medium text-[var(--text-primary)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]",
      )}
    >
      {children}
    </Link>
  );
}
