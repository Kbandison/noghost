"use client";

import Image from "next/image";
import { useActionState } from "react";
import type { ReviewPhoto } from "@/lib/photo-list";
import { publicPhotoUrl } from "@/lib/photo-url";
import { setPhotoApproval, type PhotoState } from "../actions";

const initial: PhotoState = {};

/**
 * Approving photos, where the reviewer is already looking at them.
 *
 * §7.3 lists "photo re-review" as its own thing, and it will get its own queue
 * for photos changed after admission — but the first pass belongs here, beside
 * the verification selfie. The question a reviewer is answering is "is this the
 * same person, and is this photo alright", and splitting that across two
 * screens would mean answering it twice from memory.
 *
 * Unapproved is the loud state, not approved. Every photo starts unapproved and
 * `visible_profiles` filters them, so an un-actioned photo is invisible to
 * members rather than live — the failure mode is a member wondering where their
 * photo went, which they can ask about, rather than an unreviewed image on
 * somebody's card.
 */
export function PhotoReview({ userId, photos }: { userId: string; photos: ReviewPhoto[] }) {
  const [state, action, pending] = useActionState(setPhotoApproval, initial);

  if (photos.length === 0) {
    return <p className="text-[13px] text-[var(--error)]">No photos on this profile.</p>;
  }

  const waiting = photos.filter((photo) => !photo.approved).length;

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo, i) => (
          <div key={photo.path}>
            <div
              className={`relative aspect-[4/5] overflow-hidden rounded-[3px] border bg-[var(--bg-secondary)] ${
                photo.approved ? "border-[var(--border)]" : "border-[var(--error)]"
              }`}
            >
              <Image
                src={publicPhotoUrl(photo.path)}
                alt={`Profile photo ${i + 1}`}
                fill
                sizes="(max-width: 768px) 30vw, 150px"
                className="object-cover"
              />
              {!photo.approved && (
                <span className="absolute inset-x-0 bottom-0 bg-[var(--error)] px-1.5 py-0.5 text-center text-[11px] font-medium uppercase tracking-[0.08em] text-white">
                  Not shown
                </span>
              )}
            </div>

            <form action={action} className="mt-1.5">
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="path" value={photo.path} />
              <input type="hidden" name="approved" value={photo.approved ? "no" : "yes"} />
              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-[3px] border border-[var(--border)] px-2 py-1 text-[12px] transition-colors hover:border-[var(--text-dim)] disabled:opacity-40"
              >
                {photo.approved ? "Hide" : "Approve"}
              </button>
            </form>
          </div>
        ))}
      </div>

      {state.error && (
        <p role="alert" className="mt-2 text-[13px] leading-snug text-[var(--error)]">
          {state.error}
        </p>
      )}

      <p className="mt-2 text-[12px] text-[var(--text-dim)]">
        {photos.length === 1 ? "1 photo" : `${photos.length} photos`} · first one leads their card
        {waiting > 0 && (
          <>
            {" · "}
            <strong className="font-semibold text-[var(--error)]">
              {waiting} not shown to anyone yet
            </strong>
          </>
        )}
      </p>
    </div>
  );
}
