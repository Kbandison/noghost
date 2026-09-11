import type { Metadata } from "next";
import { legalDocument } from "@noghost/config/copy";
import { LegalPage } from "@/components/layout/legal-page";

export const metadata: Metadata = { title: "Terms" };

/**
 * The document itself lives in `@noghost/config/copy` rather than here.
 *
 * The last step of the funnel opens these in a dialog, where somebody is
 * actually agreeing to them, and two copies of a legal document is how they
 * come to disagree. One source, two renderers.
 */
export default function Page() {
  const doc = legalDocument("terms")!;
  return (
    <LegalPage
      title={doc.title}
      updated={doc.updated}
      intro={doc.intro}
      sections={doc.sections}
    />
  );
}
