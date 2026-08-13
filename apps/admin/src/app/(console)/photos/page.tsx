import type { Metadata } from "next";
import Link from "next/link";
import { photosAwaitingReview } from "@/lib/photos";
import { PhotoReview } from "../admissions/[id]/photo-review";

export const metadata: Metadata = { title: "Photos" };
export const dynamic = "force-dynamic";

/**
 * The standing photo queue — spec §7.3's "photo re-review".
 *
 * Admissions reviews a person once. This is what catches everything after: a
 * photo swapped mid-season lands unapproved, 0020 keeps it off every card, and
 * this is the only screen that can put it back. An empty queue here is the
 * normal state, which is why it says so rather than showing a spinner-shaped
 * void.
 */
export default async function PhotosPage() {
  const queue = await photosAwaitingReview();

  return (
    <div className="mx-auto w-full max-w-[62rem] p-8">
      <h1 className="font-[family-name:var(--font-display)] text-[28px] font-bold tracking-[-0.02em]">
        Photos
      </h1>
      <p className="mt-1 text-[14px] text-[var(--text-dim)]">
        {queue.length === 0
          ? "Nothing waiting."
          : `${queue.length} ${queue.length === 1 ? "member" : "members"} with photos nobody can see yet`}
      </p>

      {queue.length === 0 ? (
        <p className="mt-10 max-w-[36rem] text-[15px] leading-relaxed text-[var(--text-dim)]">
          Every photo on the product has been looked at. New and changed photos land here
          automatically and stay off members&rsquo; cards until they&rsquo;re approved — so an
          empty queue means nothing is hidden, not that nothing is happening.
        </p>
      ) : (
        <ul className="mt-8 space-y-10">
          {queue.map((row) => (
            <li key={row.userId} className="border-t border-[var(--border-subtle)] pt-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-[18px] font-semibold">
                  {row.firstName}
                  <span className="ml-3 text-[14px] font-normal text-[var(--text-dim)]">
                    {row.status}
                  </span>
                </h2>
                <p className="text-[13px] text-[var(--error)]">
                  {row.waiting} waiting
                  <Link
                    href={`/admissions/${row.userId}`}
                    className="ml-4 text-[var(--text-dim)] underline decoration-[1.5px] underline-offset-4"
                  >
                    Their application
                  </Link>
                </p>
              </div>

              <div className="mt-4 max-w-[26rem]">
                <PhotoReview userId={row.userId} photos={row.photos} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
