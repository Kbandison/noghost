"use client";

import { useRef } from "react";
import { legalDocument } from "@noghost/config/copy";

/**
 * Read a policy without leaving the application.
 *
 * The last step asks somebody to agree to three documents, and the links to
 * them opened in a new tab. That is the version where nobody reads them: it
 * asks a person mid-application to go somewhere else, find their way back, and
 * trust that their half-finished form survived the trip. The honest way to ask
 * for agreement is to put the thing being agreed to within reach of the box.
 *
 * A native `<dialog>` rather than a div with a z-index. `showModal()` gives
 * focus trapping, Escape, the inert backdrop and the top layer for free — all
 * of which a hand-rolled modal gets wrong, usually by being dismissible only
 * with a mouse.
 */
export function PolicyDialog({ slug, label }: { slug: string; label: string }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const doc = legalDocument(slug);
  if (!doc) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--text-secondary)]"
      >
        {label}
      </button>

      <dialog
        ref={ref}
        /*
         * Closes on a click outside. `<dialog>` fires clicks on itself for the
         * backdrop, so comparing the target to the element distinguishes "the
         * dark area" from "anything in the panel" without a second listener.
         */
        onClick={(event) => {
          if (event.target === ref.current) ref.current?.close();
        }}
        className="m-auto max-h-[85dvh] w-[min(46rem,92vw)] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-primary)] p-0 text-[var(--text-primary)] backdrop:bg-black/50"
      >
        <div className="flex max-h-[85dvh] flex-col">
          <header className="flex items-baseline justify-between gap-4 border-b border-[var(--border)] px-6 py-4">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-[22px] font-bold tracking-[-0.015em]">
                {doc.title}
              </h2>
              <p className="mt-0.5 text-[13px] text-[var(--text-dim)]">
                Last updated {doc.updated}
              </p>
            </div>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="shrink-0 text-[15px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4 hover:text-[var(--text-primary)]"
            >
              Close
            </button>
          </header>

          {/* The scrolling region is this div, not the dialog, so the heading
              and the close button stay put while somebody reads. */}
          <div className="overflow-y-auto px-6 py-5">
            <p className="text-[16px] leading-relaxed text-[var(--text-secondary)]">{doc.intro}</p>

            <div className="mt-7 space-y-7">
              {doc.sections.map((section) => (
                <section key={section.heading}>
                  <h3 className="font-[family-name:var(--font-display)] text-[17px] font-semibold tracking-[-0.01em]">
                    {section.heading}
                  </h3>
                  <div className="mt-2 space-y-3">
                    {section.body.map((paragraph) => (
                      <p
                        key={paragraph}
                        className="text-[15px] leading-relaxed text-[var(--text-secondary)]"
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <p className="mt-8 border-t border-[var(--border)] pt-5 text-[13px] leading-relaxed text-[var(--text-dim)]">
              This is the same text as the full page, which stays at{" "}
              <span className="font-[family-name:var(--font-mono,inherit)]">
                noghostdating.app/{doc.slug}
              </span>{" "}
              if you would rather keep a copy.
            </p>
          </div>
        </div>
      </dialog>
    </>
  );
}
