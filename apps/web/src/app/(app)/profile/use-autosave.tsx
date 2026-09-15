"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Save when somebody stops typing, and say so quietly.
 *
 * The profile had a Save button under every section, which is a question the
 * page can answer itself: there is nothing to confirm, no destructive step, and
 * no reason a member should have to tell us they meant the sentence they just
 * finished writing. Photos already saved on every change; the text fields were
 * the only things still asking.
 *
 * ---------------------------------------------------------------------------
 * Why blur *and* a debounce
 * ---------------------------------------------------------------------------
 *
 * Blur alone loses the last edit whenever somebody types an answer and then
 * closes the tab, backgrounds the phone, or walks away — the field never lost
 * focus, so nothing ever fired. A debounce alone saves mid-word and turns one
 * answer into a dozen writes.
 *
 * Both: a quiet debounce catches the pause, and blur flushes immediately so
 * leaving the field is always a save rather than a race.
 */
export type SaveState = "idle" | "saving" | "saved" | "error";

export function useAutosave(
  submit: (data: FormData) => void | Promise<void>,
  /** How long a pause counts as "finished typing". */
  delay = 900,
) {
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<FormData | null>(null);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const data = pending.current;
    if (!data) return;
    pending.current = null;
    setState("saving");
    void Promise.resolve(submit(data)).then(
      () => setState("saved"),
      () => setState("error"),
    );
  }, [submit]);

  const queue = useCallback(
    (data: FormData) => {
      pending.current = data;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [flush, delay],
  );

  /*
   * A pending edit is flushed if the page is being put away. `pagehide` rather
   * than `beforeunload`: it is the one mobile browsers actually fire when a tab
   * is backgrounded or swiped away, which on a phone is how most sessions end.
   */
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flush();
    };
  }, [flush]);

  return { state, queue, flush };
}

/** The whole of the feedback: a word, and only after something happened. */
export function SaveNote({ state, error }: { state: SaveState; error?: string }) {
  if (error) {
    return (
      <p role="alert" className="text-[14px] text-[var(--error)]">
        {error}
      </p>
    );
  }
  if (state === "idle") return null;
  return (
    <p
      role="status"
      className="text-[14px] text-[var(--text-dim)] transition-opacity duration-200"
    >
      {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Didn’t save"}
    </p>
  );
}
