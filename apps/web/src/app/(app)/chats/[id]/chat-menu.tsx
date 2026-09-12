"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The three things you can do to a conversation, behind one control.
 *
 * "Close this kindly", "Found someone?" and "Report" used to sit as three
 * stacked triggers at the end of the thread, between the last message and the
 * composer. That put a permanent block of endings under every conversation —
 * the last thing you read before writing was three ways to stop.
 *
 * They live in the name bar now. Each is still one press away, and none of them
 * is in the way of the thing the screen is for.
 *
 * ---------------------------------------------------------------------------
 * Why the children expand in place instead of being menu items
 * ---------------------------------------------------------------------------
 *
 * All three are already components that render a small trigger and swap
 * themselves for a form when pressed — a six-template picker and a textarea in
 * the case of closing. Turning them into menu items would mean lifting that
 * state out of three components so this one could drive it, for no gain.
 *
 * So the panel simply holds them, and whichever one is pressed grows inside it.
 * It scrolls, because expanded they are taller than a dropdown wants to be, and
 * the alternative is a form that runs off the bottom of the screen.
 */
export function ChatMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  /*
   * Closed by Escape and by a press outside, which are the two things anybody
   * tries. Not by a press *inside*: the contents are forms, and a menu that
   * closed when you touched a radio button would be unusable.
   */
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      /*
       * `preventDefault` is the one that matters, and the first version only
       * had `stopPropagation`.
       *
       * A native `<dialog>` closes on Escape through the browser's own cancel
       * behaviour, not through a listener — so stopping propagation stops
       * nothing, and one press shut the whole conversation along with the menu.
       * Preventing the default is what leaves the dialog open.
       */
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    const onDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };

    // Capture, so Escape closes this before the dialog it sits inside does —
    // otherwise one press would shut the whole conversation.
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="More"
        className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
      >
        {/* Three dots rather than a word: the row is tight at 390px, and the
            actions behind it have no single honest name — "More" is what the
            accessible label is for. */}
        <svg viewBox="0 0 20 20" aria-hidden className="h-5 w-5" fill="currentColor">
          <circle cx="4" cy="10" r="1.6" />
          <circle cx="10" cy="10" r="1.6" />
          <circle cx="16" cy="10" r="1.6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          /*
           * Anchored to the button and pulled inside the right edge. Full width
           * on a phone would be a sheet, not a menu, and this one belongs to
           * the control it hangs from.
           */
          className="absolute right-0 top-full z-20 mt-1 max-h-[60vh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg-primary)] p-3 shadow-[0_10px_30px_rgba(0,0,0,0.16)]"
        >
          <div className="space-y-3">{children}</div>
        </div>
      )}
    </div>
  );
}
