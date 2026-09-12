"use client";

import { useEffect } from "react";
import { markNotificationsRead } from "./actions";

/**
 * Says "seen" for the whole list.
 *
 * On the client rather than in the server component, for the same reason the
 * conversation does it there: rendering is not the moment somebody read
 * something — a prefetch renders — and a write during render is a side effect
 * in the one place meant to have none.
 */
export function MarkNotificationsRead({ unread }: { unread: number }) {
  useEffect(() => {
    if (unread > 0) void markNotificationsRead();
  }, [unread]);

  return null;
}
