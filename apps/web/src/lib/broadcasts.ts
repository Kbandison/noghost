import { supabaseServer } from "./supabase";

/**
 * Announcements waiting for this member — spec §7.3's Comms, member side.
 *
 * A broadcast is the one notification in the product with nowhere to land. The
 * three templates §8 routes in-app all have a home already: a decline appears in
 * the inbox beside the note it answers, and a fuse close and a closure note are
 * system messages inside the conversation they are about. That is why there is
 * no notification centre here — it would duplicate three surfaces and add the
 * badge §3.3's ban on engagement bait exists to prevent.
 *
 * An announcement is about nothing in particular, so it gets a banner. Read
 * through the member's own session, where `owner reads own in-app
 * notifications` already restricts to `channel = 'inapp'` and to their own
 * rows — there is no filtering here that a mistake could widen.
 */

export interface Broadcast {
  id: string;
  body: string;
  at: string;
}

export async function pendingBroadcasts(): Promise<Broadcast[]> {
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("notifications")
    .select("id,payload,created_at")
    .eq("template", "broadcast")
    .is("read_at", null)
    // Oldest first: two announcements are two things that happened, in order.
    .order("created_at", { ascending: true })
    .limit(3);

  if (error) {
    // Never fatal. An announcement that cannot be read must not take a screen
    // down with it — the same rule `pendingWarning()` follows next door.
    console.error(`[broadcast] read: ${error.message}`);
    return [];
  }

  return (data ?? [])
    .map((row) => {
      const payload = (row.payload ?? {}) as { body?: string };
      return { id: row.id, body: payload.body ?? "", at: row.created_at };
    })
    .filter((broadcast) => broadcast.body.length > 0);
}
