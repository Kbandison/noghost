import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { BRAND, interpolate } from "@noghost/config";
import { HERO } from "@noghost/config/copy";
import { SmoothScroll } from "@/components/layout/smooth-scroll";
import "./globals.css";

/**
 * Fraunces carries SOFT and WONK axes, which is why it beat a stricter serif
 * here: it can be warmed without becoming a cartoon, which is precisely the
 * brief for a brand whose mascot is a friendly ghost.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(`https://${BRAND.DOMAIN}`),
  title: {
    default: `${BRAND.APP_NAME} — ${BRAND.TAGLINE}`,
    template: `%s · ${BRAND.APP_NAME}`,
  },
  description: interpolate(HERO.body, { SEASON_WEEKS: 8 }),
  openGraph: {
    type: "website",
    siteName: BRAND.APP_NAME,
    title: `${BRAND.APP_NAME} — ${BRAND.TAGLINE}`,
    description: BRAND.PITCH,
    url: `https://${BRAND.DOMAIN}`,
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.APP_NAME} — ${BRAND.TAGLINE}`,
    description: BRAND.PITCH,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#FAF7F2",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:border focus:border-[var(--border)] focus:bg-[var(--bg-tertiary)] focus:px-4 focus:py-2 focus:text-sm"
        >
          Skip to content
        </a>
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
