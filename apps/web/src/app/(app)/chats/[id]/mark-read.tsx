"use client";

import { useEffect } from "react";
import { markChatRead } from "../actions";

/**
 * Says "seen" for the conversation currently on screen.
 *
 * Keyed on the newest message rather than run once on mount. The chat stays
 * mounted while `LiveRefresh` patches new messages into it, so a reply that
 * arrives while somebody is reading would otherwise sit unread forever — the
 * badge would light up for a conversation they are looking at.
 *
 * Deliberately not in the server component. Rendering is not the moment
 * somebody read something — a prefetch renders, and Next may render a page more
 * than once — and a write during render is a side effect in the one place that
 * is supposed to have none.
 */
export function MarkRead({ chatId, latestMessageId }: { chatId: string; latestMessageId: string }) {
  useEffect(() => {
    if (!latestMessageId) return;
    void markChatRead(chatId);
  }, [chatId, latestMessageId]);

  return null;
}
