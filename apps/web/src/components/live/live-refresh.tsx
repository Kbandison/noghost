"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@noghost/db/browser";

/**
 * Ask the server for this page again when a row behind it changes.
 *
 * ---------------------------------------------------------------------------
 * Why a refresh rather than a client-side store
 * ---------------------------------------------------------------------------
 *
 * The obvious build is to subscribe to `messages`, take the payload, and append
 * a bubble. That means a second implementation of everything the server already
 * does to a message before it reaches the screen — whose side it sits on, how a
 * voice note renders, what a system closure looks like, which of them are read.
 * Two implementations of one thing drift, and the client copy is the one nobody
 * notices is wrong until somebody's closing note renders as an empty bubble.
 *
 * `router.refresh()` re-runs the server component and patches the tree in
 * place: no navigation, no scroll jump, form state preserved. The payload is
 * used only to decide *whether* to ask, never to render — so realtime cannot
 * put anything on screen that a reload would not also put there.
 *
 * ---------------------------------------------------------------------------
 * What a subscriber can see
 * ---------------------------------------------------------------------------
 *
 * Postgres Changes are filtered per subscriber by that subscriber's own RLS
 * SELECT policy (0039). `messages` is `is_chat_participant(chat_id)` and
 * `profiles` is `auth.uid() = id`, so this hook cannot be pointed at somebody
 * else's conversation by changing a prop — the server would simply never send
 * the event.
 */
export function LiveRefresh({
  table,
  filter,
  event = "*",
}: {
  table: "messages" | "profiles";
  /** A PostgREST filter, e.g. `chat_id=eq.<uuid>`. Narrows the subscription. */
  filter?: string;
  event?: "INSERT" | "UPDATE" | "*";
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    /*
     * The access token has to reach the socket BEFORE it subscribes, and
     * getting that wrong fails in the worst possible way: silently.
     *
     * Postgres Changes are authorized per subscriber against that subscriber's
     * RLS policy, so a socket that connected anonymously matches nothing —
     * `messages` is `is_chat_participant(chat_id)` and an anon connection is a
     * participant in nothing. The subscription still reports SUBSCRIBED,
     * because subscribing worked; it just never delivers. That is exactly what
     * the first version did, and the only symptom was messages not arriving.
     *
     * `createBrowserClient` reads its session from cookies asynchronously, so
     * subscribing on mount races it. This waits for the session, hands the
     * token to the realtime client, and only then opens the channel.
     */
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      const token = data.session?.access_token;
      if (token) await supabase.realtime.setAuth(token);
      if (cancelled) return;

      /*
       * The channel name has to be unique per subscription or two of them on
       * one page silently share a socket topic and only the first gets events.
       */
      channel = supabase
        .channel(`live:${table}:${filter ?? "all"}`)
        .on(
          "postgres_changes",
          { event, schema: "public", table, ...(filter ? { filter } : {}) },
          () => router.refresh(),
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
    // `router` is stable; re-subscribing on every render would tear the socket
    // down and rebuild it in a loop.
  }, [table, filter, event, router]);

  return null;
}
