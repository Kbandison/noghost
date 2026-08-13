import type { Metadata } from "next";
import Link from "next/link";
import { interpolate } from "@noghost/config";
import { REPORT_COPY } from "@noghost/config/copy";
import { requireMember } from "@/lib/member";

export const metadata: Metadata = { title: "Reported" };

/**
 * Where a report lands.
 *
 * A page rather than a card inside the sheet, because the sheet does not
 * survive its own success: filing a report revalidates, the route re-renders,
 * and the drop card or chat header the sheet lived in is gone — the reported
 * member is invisible by then. The first browser run of this flow filed the
 * report correctly and showed the member nothing at all.
 *
 * No name on this screen, deliberately. By the time it renders the person is
 * already invisible everywhere else, so printing it here would be the one place
 * left that still says it.
 *
 * Static: it takes no parameters and says the same thing to everyone, which is
 * also what stops it becoming a link that leaks who reported whom.
 */
export default async function ReportedPage() {
  await requireMember();

  return (
    <div className="mx-auto w-full max-w-[34rem] px-6 py-20">
      <h1 className="font-[family-name:var(--font-display)] text-[34px] font-extrabold leading-[1.1] tracking-[-0.03em]">
        {REPORT_COPY.doneTitle}
      </h1>
      <p className="mt-5 text-[18px] leading-relaxed text-[var(--text-secondary)]">
        {REPORT_COPY.doneBody}
      </p>
      <p className="mt-4 text-[17px] leading-relaxed text-[var(--text-secondary)]">
        {interpolate(REPORT_COPY.doneChat)}
      </p>

      <p className="mt-10 text-[15px]">
        <Link
          href="/tonight"
          className="underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
        >
          {REPORT_COPY.doneBack}
        </Link>
      </p>
    </div>
  );
}
