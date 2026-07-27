import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { APPLICATION_STEPS, nextIncompleteStep } from "@noghost/logic";
import { getPublicSeasonStats } from "@noghost/db";
import { readDraft } from "@/lib/application-draft";
import { Funnel } from "./funnel";

export const metadata: Metadata = {
  title: "Apply",
  robots: { index: false, follow: false },
};

/** The funnel reads and writes a cookie, so it can never be prerendered. */
export const dynamic = "force-dynamic";

export default async function ApplyStartPage() {
  const season = await getPublicSeasonStats();

  // No open season means there is nothing to apply to. The waitlist is the
  // honest destination rather than a form that goes nowhere.
  if (!season || season.seatsRemaining <= 0) redirect("/waitlist");

  const draft = await readDraft();
  const step = nextIncompleteStep(draft, new Date().toISOString());

  // A finished draft that never got submitted resumes at the last step rather
  // than silently submitting on page load.
  const resumeAt = step ?? APPLICATION_STEPS[APPLICATION_STEPS.length - 1]!;

  return <Funnel initialDraft={draft} initialStep={resumeAt} />;
}
