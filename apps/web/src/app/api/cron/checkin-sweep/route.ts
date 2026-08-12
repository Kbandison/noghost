import { createServiceClient } from "@noghost/db/service";
import { CHECKIN_EXPIRE_AFTER_HOURS } from "@noghost/config";
import { checkinOpensAt, fuseTransition, type FuseChat } from "@noghost/logic";
import type { NotifChannel } from "@noghost/types";
import { requireCron } from "@/lib/cron";

/**
 * `checkin-sweep` — spec §4.3, hourly.
 *
 * Opens the post-date check-in once a confirmed date's time plus 24 hours has
 * passed. That is the whole job: the +72-hour timeout on an unanswered check-in
 * is `fuse-sweep`'s, because it is a `tick` on an already-open check-in and the
 * state machine handles it there.
 *
 * The two jobs are deliberately split along that line rather than merged. A
 * check-in is *opened* from a `dates` row and *closed* from the chat's own
 * clock, so putting both in one endpoint would mean one job that has to load
 * two different worlds to decide anything.
 *
 * Idempotent: the state change is the gate, guarded by the state it was read
 * in, so a re-run inside the same hour opens nothing twice.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const denied = requireCron(request);
  if (denied) return denied;

  const now = new Date().toISOString();
  const db = createServiceClient();

  /*
   * Only `date_scheduled` chats can have a check-in open. An `active` chat has
   * no date on the calendar, and one already in `post_date_checkin` is
   * fuse-sweep's business from here.
   */
  const { data: chatRows, error: chatError } = await db
    .from("chats")
    .select("id,season_id,user_a,user_b,state,fuse_expires_at,fuse_paused_at,warned_48h,warned_24h,closed_at")
    .eq("state", "date_scheduled")
    .limit(5000);

  if (chatError) {
    return Response.json({ error: `chats: ${chatError.message}` }, { status: 500 });
  }

  const chats = chatRows ?? [];
  if (chats.length === 0) {
    return Response.json({ ok: true, ranAt: now, scheduled: 0, opened: 0 });
  }

  const { data: dateRows, error: dateError } = await db
    .from("dates")
    .select("id,chat_id,scheduled_for")
    .eq("status", "confirmed")
    .in(
      "chat_id",
      chats.map((chat) => chat.id),
    )
    // Most recent confirmed date wins: a second date restarts the clock, so an
    // older one must not drag a chat into a check-in it already had.
    .order("scheduled_for", { ascending: false });

  if (dateError) {
    return Response.json({ error: `dates: ${dateError.message}` }, { status: 500 });
  }

  const latestDate = new Map<string, { id: string; scheduledFor: string }>();
  for (const row of dateRows ?? []) {
    if (!latestDate.has(row.chat_id)) {
      latestDate.set(row.chat_id, { id: row.id, scheduledFor: row.scheduled_for });
    }
  }

  const seasonIds = [...new Set(chats.map((chat) => chat.season_id))];
  const { data: seasonRows } = await db
    .from("seasons")
    .select("id,fuse_days,ends_at")
    .in("id", seasonIds);
  const seasons = new Map((seasonRows ?? []).map((season) => [season.id, season]));

  let opened = 0;
  let waiting = 0;
  const failures: string[] = [];

  for (const row of chats) {
    const date = latestDate.get(row.id);
    const season = seasons.get(row.season_id);

    if (!date) {
      // `date_scheduled` with no confirmed date is a data fault, not a chat to
      // sweep. Reported rather than skipped silently.
      failures.push(`${row.id}: date_scheduled with no confirmed date`);
      continue;
    }
    if (!season) {
      failures.push(`${row.id}: no season row`);
      continue;
    }

    const opensAt = checkinOpensAt(date.scheduledFor);
    if (Date.parse(now) < Date.parse(opensAt)) {
      waiting += 1;
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
    };

    /*
     * `date_elapsed` rather than a hand-written state change. The transition it
     * produces is `date_scheduled → post_date_checkin`, and routing it through
     * the state machine means the season-end rule still wins: a date whose
     * check-in comes due after `ends_at` closes the chat instead of opening one
     * nobody can answer.
     */
    const result = fuseTransition(
      before,
      { type: "date_elapsed", at: now },
      { fuseDays: season.fuse_days, seasonEndsAt: season.ends_at },
    );

    if (!result.changed) continue;
    const after = result.chat;

    const { data: updated, error: updateError } = await db
      .from("chats")
      .update({
        state: after.state,
        fuse_expires_at: after.fuseExpiresAt,
        fuse_paused_at: after.fusePausedAt,
        closed_at: after.closedAt,
      })
      .eq("id", row.id)
      // The guard: two overlapping sweeps cannot both open the same check-in,
      // so nobody gets two "how did it go?" pushes about one date.
      .eq("state", "date_scheduled")
      .select("id");

    if (updateError) {
      failures.push(`${row.id}: ${updateError.message}`);
      continue;
    }
    if (!updated || updated.length === 0) continue;

    for (const effect of result.effects) {
      if (effect.kind === "closure_note") {
        // Season end reached first. Same three writes as fuse-sweep: the row,
        // the message in the conversation, and the push.
        const { error } = await db.from("closure_notes").insert({
          chat_id: row.id,
          from_user: effect.fromUser,
          template_id: effect.templateId,
          delivered_at: now,
        });
        if (error) failures.push(`${row.id}: closure note: ${error.message}`);

        const { error: messageError } = await db.from("messages").insert({
          chat_id: row.id,
          sender_id: null,
          kind: "system",
          body: effect.templateId,
        });
        if (messageError) failures.push(`${row.id}: system message: ${messageError.message}`);
        continue;
      }

      for (const user of effect.toUsers) {
        const { error } = await db.rpc("enqueue_notification", {
          p_user: user,
          p_channel: "push" satisfies NotifChannel,
          p_template: effect.template,
          p_payload: { chat_id: row.id, date_id: date.id },
        });
        if (error) failures.push(`${row.id}: notify ${effect.template}: ${error.message}`);
      }
    }

    opened += 1;
  }

  for (const failure of failures) console.error(`[checkin-sweep] ${failure}`);

  return Response.json({
    ok: true,
    ranAt: now,
    scheduled: chats.length,
    opened,
    notYetDue: waiting,
    expiresAfterHours: CHECKIN_EXPIRE_AFTER_HOURS,
    ...(failures.length > 0 ? { failures } : {}),
  });
}
