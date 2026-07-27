import { getPublicSeasonStats } from "@noghost/db";
import { Nav } from "@/components/layout/nav";
import { Footer } from "@/components/layout/footer";

/**
 * ISR, not a per-visitor query. The seats counter is real (spec §7.1 — honest
 * scarcity), and it is also identical for every anonymous visitor, so it must
 * be cached (BACKEND.md layer 1). At 60s, a hundred thousand visitors in a
 * minute cost one database read.
 */
export const revalidate = 60;

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const season = await getPublicSeasonStats();

  return (
    <>
      <Nav ctaLabel={season ? "Apply" : "Join the waitlist"} />
      <main id="main">{children}</main>
      <Footer seasonName={season?.name ?? "NoGhost"} />
    </>
  );
}
