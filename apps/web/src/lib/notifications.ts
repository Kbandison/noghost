import { SEASON_DEFAULTS } from "@noghost/config";
import { renderNotification } from "@noghost/logic";
import { supabaseServer } from "./supabase";

/**
 * Everything this product has actually sent a member, in words.
 *
 * The record push does not keep. A push is the one message here that can be
 * lost outright — dismissed from a lock screen, arriving face-down, swiped by
 * somebody clearing a shade — while SMS sits in their messages and email in
 * their inbox. "Last day with Maya" vanishing unread is the exact failure the
 * fuse exists to prevent, so there has to be somewhere to find it again.
 *
 * Rendered through `renderNotification`, the same function the sender uses, so
 * the line here and the line that arrived on the phone are the same line. A
 * second copy table would be two sources for one sentence.
 */

export interface NotificationEntry {
  id: string;
  title: string;
  body: string;
  /** Where it points, app-relative. */
  url: string;
  sentAt: string;
  readAt: string | null;
}

/**
 * Read through the member's own session, so RLS is the scope: 0041 allows the
 * owner to read their own rows once `sent_at` is set, which also keeps the
 * queue and the internal skip reasons out of reach.
 */
export async function listNotifications(limit = 50): Promise<NotificationEntry[]> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: rows, error } = await supabase
    .from("notifications")
    .select("id,template,payload,channel,sent_at,read_at")
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`[notifications] listing for ${user.id}: ${error.message}`);
    return [];
  }

  /*
   * The counterpart's name, because §9.4's copy uses it — "Maya said yes",
   * "Last day with Maya". Resolved the same way `notification-sweep` does, from
   * the chat or connect id in the payload.
   *
   * Through the member's own session again, which means a chat they are no
   * longer allowed to see yields no name and the copy falls back to its
   * nameless form rather than leaking one.
   */
  const chatIds = new Set<string>();
  const connectIds = new Set<string>();
  for (const row of rows ?? []) {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    if (typeof payload.chat_id === "string") chatIds.add(payload.chat_id);
    if (typeof payload.connect_id === "string") connectIds.add(payload.connect_id);
  }

  const [chats, connects] = await Promise.all([
    chatIds.size
      ? supabase.from("chats").select("id,user_a,user_b").in("id", [...chatIds])
      : Promise.resolve({ data: [] as { id: string; user_a: string; user_b: string }[] }),
    connectIds.size
      ? supabase.from("connects").select("id,from_user,to_user").in("id", [...connectIds])
      : Promise.resolve({ data: [] as { id: string; from_user: string; to_user: string }[] }),
  ]);

  const pairs = new Map<string, [string, string]>();
  for (const chat of chats.data ?? []) pairs.set(chat.id, [chat.user_a, chat.user_b]);
  for (const c of connects.data ?? []) pairs.set(c.id, [c.from_user, c.to_user]);

  const others = new Set<string>();
  for (const [a, b] of pairs.values()) others.add(a === user.id ? b : a);

  const names = new Map<string, string>();
  if (others.size > 0) {
    const { data: profiles } = await supabase
      .from("visible_profiles")
      .select("id,first_name")
      .in("id", [...others]);
    for (const profile of profiles ?? []) names.set(profile.id, profile.first_name as string);
  }

  const entries: NotificationEntry[] = [];
  /*
   * One entry per event, not per channel.
   *
   * `enqueue_notification` takes a channel, so one thing happening can write a
   * push row and an email row. Listing both would show somebody the same
   * sentence twice and tell them nothing except how it reached them, which is
   * our business rather than theirs. Keyed on template plus payload, keeping
   * the first — the rows arrive newest-first, so that is the most recent send.
   */
  const seen = new Set<string>();

  for (const row of rows ?? []) {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const key = `${row.template}:${JSON.stringify(payload)}`;
    if (seen.has(key)) continue;

    const ref =
      typeof payload.chat_id === "string"
        ? payload.chat_id
        : typeof payload.connect_id === "string"
          ? payload.connect_id
          : null;
    const pair = ref ? pairs.get(ref) : undefined;
    const otherId = pair ? (pair[0] === user.id ? pair[1] : pair[0]) : undefined;

    const message = renderNotification(row.template, payload, {
      firstName: otherId ? names.get(otherId) : undefined,
      timeZone: SEASON_DEFAULTS.timezone,
    });

    /*
     * A template with no copy is skipped rather than shown as a blank row. It
     * means somebody added a template and not its words — a gap worth logging
     * and never worth rendering as an empty line in front of a member.
     */
    if (!message) {
      console.error(`[notifications] no copy for template "${row.template}"`);
      continue;
    }

    seen.add(key);
    entries.push({
      id: row.id,
      title: message.title,
      body: message.body,
      url: message.url,
      sentAt: row.sent_at!,
      readAt: row.read_at,
    });
  }

  return entries;
}
