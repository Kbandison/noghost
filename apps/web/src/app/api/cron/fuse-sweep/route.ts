import { createServiceClient } from "@noghost/db/service";
import { CHECKIN_EXPIRE_AFTER_HOURS } from "@noghost/config";
import { addHours, fuseTransition, type FuseChat, type FuseEffect } from "@noghost/logic";
import { OPEN_CHAT_STATES, type NotifChannel } from "@noghost/types";
import { requireCron } from "@/lib/cron";

/**
 * `fuse-sweep` — spec §4.3, hourly.
 *
 * This is the job that makes "nobody can be ghosted" mechanical rather than
 * aspirational. It warns at 48 and 24 hours, closes a chat the moment its seven
 * days run out, and writes the closure note in the same pass — §10 lists the
 * fuse and its closure notes as things that are never cut.
 *
 * The state machine is `fuseTransition` in packages/logic, pure and covered by
 * 27 unit tests plus a 56-day simulation asserting that no chat can reach a
 * closed state without a note being delivered. This file is the thin wrapper
 * §6.3 describes: load, tick, persist.
 *
 * Idempotent. A closed chat absorbs every event, and the `warned_*` flags mean
 * a re-run inside the same window sends nothing.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const denied = requireCron(request);
  if (denied) return denied;

  const now = new Date().toISOString();
  const db = createServiceClient();

  /*
   * Open chats first, then the seasons they belong to — not the other way
   * round.
   *
   * Filtering by season phase would strand chats the moment a season flips to
   * `closed`: they would never be swept, so they would never receive the
   * `season_end` note that `fuseTransition` produces for exactly that case. A
   * chat left open forever is the one outcome this product cannot ship.
   */
  const { data: chatRows, error: chatError } = await db
    .from("chats")
    .select(
      "id,season_id,user_a,user_b,state,fuse_expires_at,fuse_paused_at,warned_48h,warned_24h,closed_at",
    )
    .in("state", [...OPEN_CHAT_STATES])
    .limit(5000);

  if (chatError) {
    return Response.json({ error: `chats: ${chatError.message}` }, { status: 500 });
  }

  const chats = chatRows ?? [];
  if (chats.length === 0) {
    return Response.json({ ok: true, ranAt: now, open: 0, warned48h: 0, warned24h: 0, closed: 0 });
  }

  const seasonIds = [...new Set(chats.map((chat) => chat.season_id))];
  const { data: seasonRows, error: seasonError } = await db
    .from("seasons")
    .select("id,name,fuse_days,ends_at")
    .in("id", seasonIds);

  if (seasonError) {
    return Response.json({ error: `seasons: ${seasonError.message}` }, { status: 500 });
  }
  const seasons = new Map((seasonRows ?? []).map((season) => [season.id, season]));

  /*
   * `checkinOpenedAt` is derived, not stored — §5's schema has no column for it
   * and the FuseChat contract says the caller supplies it. It is the confirmed
   * date's `scheduled_for` plus the 24 hours before a check-in opens, which is
   * what the sweep measures the 72-hour timeout from.
   */
  const checkinChats = chats.filter((chat) => chat.state === "post_date_checkin");
  const openedAt = new Map<string, string>();
  if (checkinChats.length > 0) {
    const { data: dateRows } = await db
      .from("dates")
      .select("chat_id,scheduled_for")
      .eq("status", "confirmed")
      .in(
        "chat_id",
        checkinChats.map((chat) => chat.id),
      )
      .order("scheduled_for", { ascending: false });

    for (const row of dateRows ?? []) {
      // Most recent confirmed date wins — a second date restarts the clock.
      if (!openedAt.has(row.chat_id)) {
        openedAt.set(row.chat_id, addHours(row.scheduled_for, 24));
      }
    }
  }

  let warned48 = 0;
  let warned24 = 0;
  let closed = 0;
  const failures: string[] = [];

  for (const row of chats) {
    const season = seasons.get(row.season_id);
    if (!season) {
      failures.push(`${row.id}: no season row`);
      continue;
    }

    const before: FuseChat = {
      id: row.id,
      state: row.state,
      userA: row.user_a,
      userB: row.user_b,
      fuseExpiresAt: row.fuse_expires_at,
      fusePausedAt: row.fuse_paused_at,
      warned48h: row.warned_48h,
      warned24h: row.warned_24h,
      closedAt: row.closed_at,
      checkinOpenedAt: openedAt.get(row.id) ?? null,
    };

    const result = fuseTransition(before, { type: "tick", at: now }, {
      fuseDays: season.fuse_days,
      seasonEndsAt: season.ends_at,
    });

    if (!result.changed) continue;

    const after = result.chat;

    /*
     * The state change goes first, and it carries its own guard: the update
     * only matches a row still in the state we read. Two overlapping sweeps
     * cannot both close the same chat, so nobody gets two closure notes about
     * the same ending.
     */
    const { data: updated, error: updateError } = await db
      .from("chats")
      .update({
        state: after.state,
        fuse_expires_at: after.fuseExpiresAt,
        fuse_paused_at: after.fusePausedAt,
        warned_48h: after.warned48h,
        warned_24h: after.warned24h,
        closed_at: after.closedAt,
      })
      .eq("id", row.id)
      .eq("state", row.state)
      .select("id");

    if (updateError) {
      failures.push(`${row.id}: ${updateError.message}`);
      continue;
    }
    if (!updated || updated.length === 0) {
      // Somebody else moved it — a member closing kindly, or a concurrent
      // sweep. Their effects are theirs to write.
      continue;
    }

    const applied = await applyEffects(db, row.id, result.effects);
    failures.push(...applied.errors.map((message) => `${row.id}: ${message}`));

    if (after.state !== row.state) closed += 1;
    else if (!before.warned24h && after.warned24h) warned24 += 1;
    else if (!before.warned48h && after.warned48h) warned48 += 1;
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`[fuse-sweep] ${failure}`);
  }

  return Response.json({
    ok: true,
    ranAt: now,
    open: chats.length,
    warned48h: warned48,
    warned24h: warned24,
    closed,
    checkinTimeoutHours: CHECKIN_EXPIRE_AFTER_HOURS,
    ...(failures.length > 0 ? { failures } : {}),
  });
}

type Db = ReturnType<typeof createServiceClient>;

/**
 * Writes the effects the state machine returned.
 *
 * A closure note becomes three things, and all three matter: the row in
 * `closure_notes` (§5 calls that table "the product promise"), a `system`
 * message so the note is actually *in* the conversation, and the push. Without
 * the message the notification points at an empty chat, which is a promise kept
 * on paper only.
 */
async function applyEffects(
  db: Db,
  chatId: string,
  effects: FuseEffect[],
): Promise<{ errors: string[] }> {
  const errors: string[] = [];

  for (const effect of effects) {
    if (effect.kind === "closure_note") {
      const { error } = await db.from("closure_notes").insert({
        chat_id: chatId,
        from_user: effect.fromUser,
        template_id: effect.templateId,
        ...(effect.personalLine !== undefined ? { personal_line: effect.personalLine } : {}),
        delivered_at: new Date().toISOString(),
      });
      if (error) errors.push(`closure note: ${error.message}`);

      const { error: messageError } = await db.from("messages").insert({
        chat_id: chatId,
        sender_id: null,
        kind: "system",
        body: effect.templateId,
      });
      if (messageError) errors.push(`system message: ${messageError.message}`);
      continue;
    }

    for (const user of effect.toUsers) {
      const { error } = await db.rpc("enqueue_notification", {
        p_user: user,
        p_channel: "push" satisfies NotifChannel,
        p_template: effect.template,
        p_payload: { chat_id: chatId },
      });
      if (error) errors.push(`notify ${effect.template}: ${error.message}`);
    }
  }

  return { errors };
}
