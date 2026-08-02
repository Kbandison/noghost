import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { BRAND } from "@noghost/config";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: `${BRAND.APP_NAME} admin`, template: `%s · ${BRAND.APP_NAME} admin` },
  // The console must never be indexed, and it must never leak a member's name
  // into a referrer header on an outbound link.
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable}`}>
      <body className="min-h-dvh bg-[var(--bg-primary)] font-[family-name:var(--font-body)] text-[var(--text-primary)] antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-[var(--bg-primary)] focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
