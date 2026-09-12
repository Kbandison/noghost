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
      className="m-0 h-[100dvh] max-h-none w-screen max-w-none border-0 bg-transparent p-0 backdrop:bg-black/50 md:m-auto md:h-auto md:max-h-[88dvh] md:w-[min(52rem,92vw)]"
    >
      {/*
        * Full-bleed on a phone, a panel from `md` up.
        *
        * This was briefly an 82dvh card on every size, to keep the list visible
        * around it. On a phone that was the wrong trade: a conversation is what
        * this product is for, and boxing it into four-fifths of a 390px screen
        * spends the only room it has on proving the Inbox is still behind it.
        * The header says where you are, and Back and Escape both return there.
        *
        * On a wide screen the panel stays, because there the space is free.
        */}
      <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-primary)] md:max-h-[88dvh] md:rounded-md md:border md:border-[var(--border)]">
        {/*
          * No close bar.
          *
          * A phone has a back gesture and a back button, and both already close
          * this — the dialog exists because a navigation happened, so undoing
          * that navigation is what closing it means. A row whose only job was
          * to duplicate a control the device already provides was costing ~48px
          * at the top of every conversation, directly above the name bar.
          *
          * Three ways out remain and none of them is hidden: back, Escape, and
          * a press on the backdrop.
          */}
        {/*
          * `overflow-hidden`, not `auto`.
          *
          * The conversation pins its own header and composer and scrolls only
          * the messages between them, which it can only do if nothing outside
          * it scrolls first — a scrolling parent would carry the composer up
          * the screen with the thread. A note has no pinned parts and brings
          * its own `overflow-y-auto` instead.
          */}
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </dialog>
  );
}
