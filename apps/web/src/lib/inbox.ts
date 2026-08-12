import type { ConnectStatus, ProfilePhoto, ProfilePromptAnswer, PromptRef } from "@noghost/types";
import { supabaseServer } from "./supabase";

/**
 * The inbox — spec §7.2, and the promise in §6.2.
 *
 * Two halves, and the second one is not optional. Incoming connects are what
 * §7.2 describes; outgoing ones are where the *answer* to a note you sent
 * appears. A decline writes `connect_declined` as an `inapp` notification, and
 * §8's matrix marks it `required: true` — an inbox that only showed arrivals
 * would leave the one message the product exists to deliver with nowhere to
 * land. "Nobody gets ghosted" includes you.
 *
 * Every read runs under RLS, where `sender reads own sent connects` and
 * `recipient reads their inbox` are separate policies, so neither half can
 * accidentally show the other person's view.
 */

export interface InboxPerson {
  id: string;
  firstName: string;
  age: number;
  neighborhood: string | null;
  occupation: string | null;
  photos: ProfilePhoto[];
  prompts: ProfilePromptAnswer[];
  interests: string[];
}

export interface IncomingConnect {
  id: string;
  status: ConnectStatus;
  createdAt: string;
  respondedAt: string | null;
  promptRef: PromptRef | null;
  replyText: string | null;
  replyVoicePath: string | null;
  from: InboxPerson;
  /** Present once accepted — the chat the acceptance opened. */
  chat: { id: string; fuseExpiresAt: string } | null;
}

export interface OutgoingConnect {
  id: string;
  status: ConnectStatus;
  createdAt: string;
  respondedAt: string | null;
  promptRef: PromptRef | null;
  replyText: string | null;
  to: InboxPerson;
  chat: { id: string; fuseExpiresAt: string } | null;
}

export interface Inbox {
  incoming: IncomingConnect[];
  outgoing: OutgoingConnect[];
  /**
   * The member's own prompts and photos.
   *
   * Needed because `prompt_ref` always points at the profile that was *shown on
   * the card* — which is the recipient. So on a note you received it refers to
   * something of yours, and rendering it from the sender's profile shows the
   * question with no answer under it: the screen's entire job is "which of your
   * things did they respond to", and it was silently answering nothing.
   */
  self: { prompts: ProfilePromptAnswer[]; photos: ProfilePhoto[] };
}

const PERSON_COLUMNS =
  "id,first_name,age,neighborhood,occupation,photos,prompts,interests";

type PersonRow = {
  id: string;
  first_name: string;
  age: number;
  neighborhood: string | null;
  occupation: string | null;
  photos: unknown;
  prompts: unknown;
  interests: string[] | null;
};

function person(row: PersonRow): InboxPerson {
  return {
    id: row.id,
    firstName: row.first_name,
    age: row.age,
    neighborhood: row.neighborhood,
    occupation: row.occupation,
    photos: Array.isArray(row.photos) ? (row.photos as ProfilePhoto[]) : [],
    prompts: Array.isArray(row.prompts) ? (row.prompts as ProfilePromptAnswer[]) : [],
    interests: row.interests ?? [],
  };
}

function promptRef(value: unknown): PromptRef | null {
  if (typeof value !== "object" || value === null) return null;
  const ref = value as { type?: unknown; id?: unknown };
  if ((ref.type !== "prompt" && ref.type !== "photo") || typeof ref.id !== "string") return null;
  return { type: ref.type, id: ref.id };
}

/**
 * How many notes are waiting on this member — the tab count.
 *
 * A `head` count rather than `loadInbox().length`, because the layout renders on
 * every page in the group and does not need three profile joins to draw a badge.
 */
export async function unansweredCount(memberId: string): Promise<number> {
  const supabase = await supabaseServer();
  const { count } = await supabase
    .from("connects")
    .select("id", { head: true, count: "exact" })
    .eq("to_user", memberId)
    .eq("status", "pending");
  return count ?? 0;
}

export async function loadInbox(memberId: string): Promise<Inbox> {
  const supabase = await supabaseServer();

  const [{ data: incomingRows }, { data: outgoingRows }] = await Promise.all([
    supabase
      .from("connects")
      .select(
        "id,status,created_at,responded_at,prompt_ref,reply_text,reply_voice_path,from_user",
      )
      .eq("to_user", memberId)
      // Newest first. A note that arrived tonight is the one being answered.
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("connects")
      .select("id,status,created_at,responded_at,prompt_ref,reply_text,to_user")
      .eq("from_user", memberId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const incoming = incomingRows ?? [];
  const outgoing = outgoingRows ?? [];

  // Read from `profiles`, not `visible_profiles`: `owner reads own profile` is
  // the policy that applies, and the view deliberately hides identity internals
  // even from their owner.
  const { data: own } = await supabase
    .from("profiles")
    .select("prompts,photos")
    .eq("id", memberId)
    .maybeSingle();

  const self = {
    prompts: Array.isArray(own?.prompts) ? (own.prompts as ProfilePromptAnswer[]) : [],
    photos: Array.isArray(own?.photos) ? (own.photos as ProfilePhoto[]) : [],
  };

  const peopleIds = [
    ...new Set([...incoming.map((c) => c.from_user), ...outgoing.map((c) => c.to_user)]),
  ];
  const connectIds = [...incoming, ...outgoing].map((c) => c.id);

  /*
   * Chats are fetched by `connect_id`, which is unique on `chats`. Not an
   * embed: the hand-written `Database` type declares `Relationships: []`, so a
   * PostgREST embed compiles to `never` — same reason as lib/admissions.ts in
   * the admin app.
   */
  const [{ data: peopleRows }, { data: chatRows }] = await Promise.all([
    peopleIds.length > 0
      ? supabase.from("visible_profiles").select(PERSON_COLUMNS).in("id", peopleIds)
      : Promise.resolve({ data: [] as PersonRow[] }),
    connectIds.length > 0
      ? supabase
          .from("chats")
          .select("id,connect_id,fuse_expires_at")
          .in("connect_id", connectIds)
      : Promise.resolve({ data: [] as { id: string; connect_id: string; fuse_expires_at: string }[] }),
  ]);

  const byId = new Map((peopleRows ?? []).map((row) => [row.id, person(row as PersonRow)]));
  const chatFor = new Map(
    (chatRows ?? []).map((row) => [
      row.connect_id,
      { id: row.id, fuseExpiresAt: row.fuse_expires_at },
    ]),
  );

  return {
    self,
    /*
     * A connect whose profile is unreadable is dropped rather than shown blank.
     * `can_view_profile` returns false once a report sits between two people,
     * and after that they should not appear in each other's world at all — not
     * even as a nameless row that still remembers something happened.
     */
    incoming: incoming.flatMap((row): IncomingConnect[] => {
      const from = byId.get(row.from_user);
      if (!from) return [];
      return [
        {
          id: row.id,
          status: row.status,
          createdAt: row.created_at,
          respondedAt: row.responded_at,
          promptRef: promptRef(row.prompt_ref),
          replyText: row.reply_text,
          replyVoicePath: row.reply_voice_path,
          from,
          chat: chatFor.get(row.id) ?? null,
        },
      ];
    }),
    outgoing: outgoing.flatMap((row): OutgoingConnect[] => {
      const to = byId.get(row.to_user);
      if (!to) return [];
      return [
        {
          id: row.id,
          status: row.status,
          createdAt: row.created_at,
          respondedAt: row.responded_at,
          promptRef: promptRef(row.prompt_ref),
          replyText: row.reply_text,
          to,
          chat: chatFor.get(row.id) ?? null,
        },
      ];
    }),
  };
}

/*
 * The decline note is rendered from the connect's own status, not from the
 * `notifications` row `respond_connect` writes.
 *
 * The notification is the delivery record for push and email. The in-app copy
 * comes from `SYSTEM_CLOSURES.decline_auto`, so it renders from the fact that
 * the connect was declined — no notification lookup, and no write during a page
 * render just to mark something read. Read state belongs with a notification
 * centre, which does not exist yet.
 */
