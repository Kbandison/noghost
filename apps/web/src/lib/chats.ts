import { fuseUrgency, type FuseUrgency } from "@noghost/logic";
import type {
  ChatState,
  CheckinAnswer,
  DateStatus,
  MessageKind,
  ProfilePhoto,
} from "@noghost/types";
import { isChatClosed } from "@noghost/types";
import { supabaseServer } from "./supabase";
import { signedVoiceUrls } from "./voice-urls";

/**
 * Reading chats — spec §7.2.
 *
 * Every read runs under the member's own session. `participants read their
 * chats` and `participants read messages` are the policies that grant it, and
 * `date_checkins` has the tightest policy in the schema (own row only), so a
 * bug in this file cannot show one person the other's raw check-in answer.
 */

export interface ChatPartner {
  id: string;
  firstName: string;
  age: number;
  photos: ProfilePhoto[];
}

export interface ChatMessage {
  id: string;
  kind: MessageKind;
  body: string | null;
  voicePath: string | null;
  /**
   * A signed URL for `voicePath`, valid for a day, minted on this render.
   *
   * Resolved here rather than in the component because the bucket is private
   * and signing is a server capability — and because one batched call covers
   * the whole thread. Null when the object could not be signed, which the
   * player renders as a note it cannot play rather than as an error.
   */
  voiceUrl: string | null;
  voiceDurationMs: number | null;
  /** Null for a system message — the app is speaking, not a person. */
  senderId: string | null;
  createdAt: string;
  mine: boolean;
}

export interface ChatDate {
  id: string;
  status: DateStatus;
  scheduledFor: string;
  placeName: string;
  placeNote: string | null;
  proposedBy: string;
  /** Only the other person can confirm — §6.3's anti-loophole rule. */
  awaitingMe: boolean;
}

export interface ChatSummary {
  id: string;
  state: ChatState;
  fuseExpiresAt: string;
  urgency: FuseUrgency;
  hoursLeft: number;
  partner: ChatPartner;
  lastMessage: { body: string | null; kind: MessageKind; mine: boolean } | null;
  lastAt: string;
  /** The calendar chip §7.2 shows instead of a ring. */
  scheduledFor: string | null;
}

export interface ChatDetail extends ChatSummary {
  messages: ChatMessage[];
  dates: ChatDate[];
  closureTemplateId: string | null;
  /**
   * The open check-in, if the chat is in one.
   *
   * `myAnswer` is *only* the caller's own row — `date_checkins` has the
   * tightest policy in the schema (`auth.uid() = user_id`), and §5's own note
   * on the table is that "a participant never sees the other side's raw
   * answer". So there is deliberately no field here for theirs: not withheld
   * by this code, unreadable by it.
   */
  checkin: { dateId: string; placeName: string; myAnswer: CheckinAnswer | null } | null;
  /**
   * Where the one graduation question stands, from this member's side.
   *
   * §6.5: "Declining a graduation proposal is allowed and private; chat simply
   * continues." RLS cannot enforce that half — `participants read graduations`
   * lets the proposer read their own row after it is declined — so this read
   * layer is the guard. It takes two shapes to do it:
   *
   *   answer   a proposal from *them*, still open, waiting on me
   *   iAsked   I have asked, at any point, whatever came of it
   *
   * `iAsked` is deliberately status-blind, and that is the whole privacy
   * mechanic. Filtering declines out of the proposer's view is not enough on its
   * own: if the "Found someone?" button vanished on asking and came back on
   * being declined, its reappearance *is* the notification. So an ask is spent
   * permanently — one question per chat per person, and the screen looks
   * identical whether the answer was no or hasn't come yet.
   *
   * A confirmation announces itself by other means: both accounts become
   * `found_someone` and `/tonight` redirects to the graduation screen.
   */
  graduation: { answer: { id: string } | null; iAsked: boolean } | null;
}

const CHAT_COLUMNS =
  "id,state,user_a,user_b,fuse_expires_at,fuse_paused_at,warned_48h,warned_24h,closed_at,created_at";

type ChatRow = {
  id: string;
  state: ChatState;
  user_a: string;
  user_b: string;
  fuse_expires_at: string;
  fuse_paused_at: string | null;
  warned_48h: boolean;
  warned_24h: boolean;
  closed_at: string | null;
  created_at: string;
};

/** Whole hours left, floored at zero. Never a second-by-second countdown (§3.3). */
function hoursLeft(chat: ChatRow, now: string): number {
  const ms = Date.parse(chat.fuse_expires_at) - Date.parse(now);
  return Math.max(Math.floor(ms / 3_600_000), 0);
}

function toFuseChat(row: ChatRow) {
  return {
    id: row.id,
    state: row.state,
    userA: row.user_a,
    userB: row.user_b,
    fuseExpiresAt: row.fuse_expires_at,
    fusePausedAt: row.fuse_paused_at,
    warned48h: row.warned_48h,
    warned24h: row.warned_24h,
    closedAt: row.closed_at,
  };
}

/**
 * The chat list, sorted by fuse urgency — §7.2.
 *
 * Not by recency. A conversation with nineteen hours left needs attention more
 * than one somebody messaged five minutes ago, and the whole point of the fuse
 * is that time is the thing you cannot ignore.
 */
export async function listChats(memberId: string, now: string): Promise<ChatSummary[]> {
  const supabase = await supabaseServer();

  const { data: rows } = await supabase
    .from("chats")
    .select(CHAT_COLUMNS)
    .order("fuse_expires_at", { ascending: true })
    .limit(200);

  const chats = (rows ?? []) as ChatRow[];
  if (chats.length === 0) return [];

  const partnerIds = [...new Set(chats.map((c) => (c.user_a === memberId ? c.user_b : c.user_a)))];
  const chatIds = chats.map((c) => c.id);

  const [{ data: people }, { data: messages }, { data: dates }] = await Promise.all([
    supabase.from("visible_profiles").select("id,first_name,age,photos").in("id", partnerIds),
    /*
     * One query for every chat's messages, newest first, then the first hit per
     * chat wins. A per-chat "latest message" query would be one round trip per
     * row — and PostgREST has no DISTINCT ON to do it in a single statement.
     */
    supabase
      .from("messages")
      .select("id,chat_id,kind,body,sender_id,created_at")
      .in("chat_id", chatIds)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("dates")
      .select("id,chat_id,scheduled_for,status")
      .in("chat_id", chatIds)
      .eq("status", "confirmed")
      .order("scheduled_for", { ascending: false }),
  ]);

  const byId = new Map(
    (people ?? []).map((row) => [
      row.id,
      {
        id: row.id,
        firstName: row.first_name,
        age: row.age,
        photos: Array.isArray(row.photos) ? (row.photos as ProfilePhoto[]) : [],
      },
    ]),
  );

  const latest = new Map<string, NonNullable<typeof messages>[number]>();
  for (const message of messages ?? []) {
    if (!latest.has(message.chat_id)) latest.set(message.chat_id, message);
  }

  const nextDate = new Map<string, string>();
  for (const date of dates ?? []) {
    if (!nextDate.has(date.chat_id)) nextDate.set(date.chat_id, date.scheduled_for);
  }

  return chats.flatMap((row): ChatSummary[] => {
    const partnerId = row.user_a === memberId ? row.user_b : row.user_a;
    const partner = byId.get(partnerId);
    // Unreadable partner means a report now sits between them. Drop the row
    // rather than render a nameless chat — same rule as the drop and the inbox.
    if (!partner) return [];

    const last = latest.get(row.id);

    return [
      {
        id: row.id,
        state: row.state,
        fuseExpiresAt: row.fuse_expires_at,
        urgency: fuseUrgency(toFuseChat(row), now),
        hoursLeft: hoursLeft(row, now),
        partner,
        lastMessage: last
          ? { body: last.body, kind: last.kind, mine: last.sender_id === memberId }
          : null,
        lastAt: last?.created_at ?? row.created_at,
        scheduledFor: nextDate.get(row.id) ?? null,
      },
    ];
  });
}

export async function getChat(
  chatId: string,
  memberId: string,
  now: string,
): Promise<ChatDetail | null> {
  const supabase = await supabaseServer();

  const { data: row } = await supabase
    .from("chats")
    .select(CHAT_COLUMNS)
    .eq("id", chatId)
    .maybeSingle();

  if (!row) return null;
  const chat = row as ChatRow;

  const partnerId = chat.user_a === memberId ? chat.user_b : chat.user_a;

  const [
    { data: partnerRow },
    { data: messageRows },
    { data: dateRows },
    { data: note },
    { data: myCheckins },
    { data: graduationRows },
  ] = await Promise.all([
    supabase
      .from("visible_profiles")
      .select("id,first_name,age,photos")
      .eq("id", partnerId)
      .maybeSingle(),
    supabase
      .from("messages")
      .select("id,kind,body,voice_path,voice_duration_ms,sender_id,created_at")
      .eq("chat_id", chatId)
      // Oldest first — a conversation reads downward. `(created_at, id)`
      // because `respond_connect` seeds message #1 in the same transaction
      // that creates the chat, so timestamps can tie.
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("dates")
      .select("id,status,scheduled_for,place_name,place_note,proposed_by")
      .eq("chat_id", chatId)
      .order("scheduled_for", { ascending: true }),
    supabase
      .from("closure_notes")
      .select("template_id")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Unfiltered by user on purpose: RLS returns only the caller's own rows,
    // so adding `.eq("user_id", memberId)` would restate the boundary in
    // application code and invite someone to "fix" it by widening the policy.
    supabase.from("date_checkins").select("date_id,answer").limit(50),
    /*
     * Every row, not just the open one — `iAsked` has to survive a decline.
     * Not `.maybeSingle()` either: `propose_graduation` inserts, so two people
     * asking at the same moment is two rows, and a single-row read would throw
     * on the one chat where both of them were sure.
     */
    supabase
      .from("graduations")
      .select("id,proposed_by,status")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (!partnerRow) return null;

  const partner: ChatPartner = {
    id: partnerRow.id,
    firstName: partnerRow.first_name,
    age: partnerRow.age,
    photos: Array.isArray(partnerRow.photos) ? (partnerRow.photos as ProfilePhoto[]) : [],
  };

  /*
   * One signing call for the thread, after the reads rather than inside them:
   * the paths are not known until the messages come back.
   */
  const voiceUrls = await signedVoiceUrls((messageRows ?? []).map((message) => message.voice_path));

  const messages: ChatMessage[] = (messageRows ?? []).map((message) => ({
    id: message.id,
    kind: message.kind,
    body: message.body,
    voicePath: message.voice_path,
    voiceUrl: message.voice_path ? (voiceUrls.get(message.voice_path) ?? null) : null,
    voiceDurationMs: message.voice_duration_ms,
    senderId: message.sender_id,
    createdAt: message.created_at,
    mine: message.sender_id === memberId,
  }));

  const last = messages[messages.length - 1];

  return {
    id: chat.id,
    state: chat.state,
    fuseExpiresAt: chat.fuse_expires_at,
    urgency: fuseUrgency(toFuseChat(chat), now),
    hoursLeft: hoursLeft(chat, now),
    partner,
    lastMessage: last ? { body: last.body, kind: last.kind, mine: last.mine } : null,
    lastAt: last?.createdAt ?? chat.created_at,
    scheduledFor:
      (dateRows ?? []).find((date) => date.status === "confirmed")?.scheduled_for ?? null,
    messages,
    dates: (dateRows ?? []).map((date) => ({
      id: date.id,
      status: date.status,
      scheduledFor: date.scheduled_for,
      placeName: date.place_name,
      placeNote: date.place_note,
      proposedBy: date.proposed_by,
      // §6.3: only the person who did *not* propose can confirm. Self-confirming
      // would let one member pause a fuse on their own, which is the loophole.
      awaitingMe: date.status === "proposed" && date.proposed_by !== memberId,
    })),
    closureTemplateId: isChatClosed(chat.state) ? (note?.template_id ?? null) : null,
    graduation: (() => {
      const rows = graduationRows ?? [];
      if (rows.length === 0) return null;
      const answer = rows.find((row) => row.status === "proposed" && row.proposed_by !== memberId);
      return {
        answer: answer ? { id: answer.id } : null,
        iAsked: rows.some((row) => row.proposed_by === memberId),
      };
    })(),
    checkin: (() => {
      if (chat.state !== "post_date_checkin") return null;
      // The most recent confirmed date is the one being checked in on.
      const date = [...(dateRows ?? [])]
        .filter((row) => row.status === "confirmed")
        .sort((a, b) => Date.parse(b.scheduled_for) - Date.parse(a.scheduled_for))[0];
      if (!date) return null;
      const own = (myCheckins ?? []).find((row) => row.date_id === date.id);
      return {
        dateId: date.id,
        placeName: date.place_name,
        myAnswer: (own?.answer as CheckinAnswer | undefined) ?? null,
      };
    })(),
  };
}

/** Open chats, for the nav tab. */
export async function openChatCount(memberId: string): Promise<number> {
  const supabase = await supabaseServer();
  const { count } = await supabase
    .from("chats")
    .select("id", { head: true, count: "exact" })
    .in("state", ["active", "date_scheduled", "post_date_checkin"])
    .or(`user_a.eq.${memberId},user_b.eq.${memberId}`);
  return count ?? 0;
}
