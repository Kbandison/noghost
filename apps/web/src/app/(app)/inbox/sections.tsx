"use client";

import { useSyncExternalStore, useCallback } from "react";
import { cn } from "@/lib/utils";

/**
 * A section you can fold away, and which stays folded.
 *
 * The Inbox was a flat run of rows under flat headings — everything present,
 * nothing shaped. Folding gives the page a hierarchy a member can set
 * themselves: somebody mid-season with two notes and nine conversations wants
 * different things open than somebody on day one.
 *
 * ---------------------------------------------------------------------------
 * Why the state is in localStorage and not useState
 * ---------------------------------------------------------------------------
 *
 * A default is a guess about what somebody wants, and this one is made afresh
 * on every navigation — open a conversation, come back, and a section they
 * deliberately folded is open again. Persisting it means the default only has
 * to be right once, which is also why it is worth arguing about less.
 *
 * `useSyncExternalStore` rather than an effect: the server has no localStorage,
 * so the server snapshot is the default and the client's is the stored value.
 * Reading it in a `useState` initialiser would run on the server, bake the
 * default into the HTML, and never re-read — the same trap the radius chips hit
 * with `navigator.language`.
 */

const KEY = (id: string) => `noghost.section.${id}`;

/** Every mounted section re-reads on any change, so two tabs agree. */
const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function Section({
  id,
  title,
  count,
  defaultOpen = false,
  children,
}: {
  /** Stable across renames — the stored preference is keyed on it. */
  id: string;
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const open = useSyncExternalStore(
    subscribe,
    () => {
      const stored = window.localStorage.getItem(KEY(id));
      return stored === null ? defaultOpen : stored === "1";
    },
    // Server: the default, every time. Any other answer would be a guess about
    // a browser this render has never seen.
    () => defaultOpen,
  );

  const toggle = useCallback(() => {
    const stored = window.localStorage.getItem(KEY(id));
    const now = stored === null ? defaultOpen : stored === "1";
    window.localStorage.setItem(KEY(id), now ? "0" : "1");
    emit();
  }, [id, defaultOpen]);

  const panelId = `section-${id}`;

  return (
    <section>
      <h2>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-5 py-2.5 text-left text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)] transition-colors hover:text-[var(--text-primary)]"
        >
          {/* Rotation rather than swapping two glyphs: the movement says which
              way it went, which a character appearing and disappearing does not. */}
          <svg
            viewBox="0 0 12 12"
            aria-hidden
            className={cn(
              "h-3 w-3 shrink-0 transition-transform duration-200",
              open ? "rotate-90" : "rotate-0",
            )}
          >
            <path d="M4 2.5 L8 6 L4 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          {title}
          <span className="opacity-60">{count}</span>
        </button>
      </h2>
      {/* Unmounted rather than hidden. These rows carry signed voice URLs and
          images; keeping a collapsed section in the tree would fetch all of it
          to show none of it. */}
      {open && <div id={panelId}>{children}</div>}
    </section>
  );
}
