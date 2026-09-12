"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * The dialog a note or a conversation opens in.
 *
 * Opening one used to push the detail *under* the list rather than over it —
 * the layout is `flex-col md:flex-row`, so on a phone the detail landed below a
 * screenful of rows and looked like nothing had happened until you scrolled.
 *
 * Paired with an intercepting route, so all four of these hold at once:
 *
 *   - the URL is the real one, and can be shared
 *   - opening it directly, or refreshing, renders the full page instead
 *   - Back closes the dialog rather than leaving the section
 *   - Forward reopens it
 *
 * Native `<dialog>` with `showModal()`, as with the policy panels: focus
 * trapping, Escape, the inert backdrop and the top layer come with it, and all
 * four are things a hand-rolled overlay gets wrong.
 */
export function Modal({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  /*
   * `back()`, not `push`. The dialog exists because a navigation happened, so
   * undoing that navigation is what closing it means — and it keeps Back,
   * Escape and the close button doing one identical thing rather than three
   * similar ones.
   */
  const close = useCallback(() => router.back(), [router]);

  return (
    <dialog
      ref={ref}
      onClose={close}
      // A dialog fires backdrop clicks on itself, so comparing the target to
      // the element is what separates "the dark area" from "the panel".
      onClick={(event) => {
        if (event.target === ref.current) close();
      }}
      className="m-auto max-h-[82dvh] w-[min(52rem,92vw)] border-0 bg-transparent p-0 backdrop:bg-black/50"
    >
      {/*
        * A panel, not a takeover — on a phone as much as anywhere.
        *
        * The first version was full-bleed below `md`: `h-[100dvh] w-screen`.
        * That is the pattern a native app uses for a pushed screen, and it made
        * the dialog indistinguishable from the navigation it was meant to
        * replace — nothing behind it, no edges, no sense that the list was
        * still there. The point of opening over the Inbox is being able to see
        * that you are still in the Inbox.
        *
        * 82dvh leaves the backdrop visible top and bottom, and clears the fixed
        * tab bar at the foot of the screen rather than sitting under it.
        */}
      <div className="flex max-h-[82dvh] flex-col overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-primary)] shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
        <div className="flex shrink-0 items-center justify-end border-b border-[var(--border-subtle)] px-4 py-2.5">
          <button
            type="button"
            onClick={close}
            className="rounded-md px-2 py-1 text-[15px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </dialog>
  );
}
