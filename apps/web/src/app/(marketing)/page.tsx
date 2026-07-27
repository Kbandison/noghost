import { notFound } from "next/navigation";
import { getPublicSeasonStats } from "@noghost/db";
import { seasonVars } from "@/lib/season-copy";
import { Hero } from "./_components/hero";
import {
  ClosurePromise,
  Mechanics,
  Problem,
  VerificationStrip,
} from "./_components/story";
import { ApplyCta, FaqPreview, Pricing } from "./_components/closing";

export const revalidate = 60;

export default async function HomePage() {
  const season = await getPublicSeasonStats();

  // No open season means the waitlist is the whole story; the marketing home
  // has nothing honest to say. Redirect handled by the waitlist route.
  if (!season) notFound();

  const vars = seasonVars(season);

  return (
    <>
      <Hero vars={vars} />
      <Problem />
      <Mechanics vars={vars} />
      <ClosurePromise vars={vars} />
      <Pricing vars={vars} />
      <VerificationStrip vars={vars} />
      <FaqPreview vars={vars} />
      <ApplyCta vars={vars} />
    </>
  );
}
