import type { Metadata } from "next";
import type { ApplicationStatus } from "@noghost/types";
import { Queue } from "./queue";

export const metadata: Metadata = { title: "Admissions" };
export const dynamic = "force-dynamic";

export default async function AdmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  return (
    <div className="flex">
      <Queue status={(status as ApplicationStatus | "all") ?? "under_review"} />

      <div className="flex flex-1 items-center justify-center p-10">
        <p className="max-w-[24rem] text-center text-[15px] leading-relaxed text-[var(--text-dim)]">
          Pick an application to review it. You&rsquo;ll see their photos and their verification
          selfie side by side.
        </p>
      </div>
    </div>
  );
}
