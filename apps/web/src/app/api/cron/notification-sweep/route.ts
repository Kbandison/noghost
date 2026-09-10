import { createServiceClient } from "@noghost/db/service";
import { SEASON_DEFAULTS } from "@noghost/config";
import {
  planNotification,
  renderEmail,
  renderNotification,
  type NotificationPrefs,
} from "@noghost/logic";
import { requireCron } from "@/lib/cron";
import { emailConfigured, sendEmail } from "@/lib/email";
import { pushConfigured, sendPush, type PushTarget } from "@/lib/push";

/**
 * `notification-sweep` — the drain. Spec §8.
 *
 * `notifications` has existed since 0005 and every RPC and cron in the product
 * enqueues into it. Nothing has ever read it. Until this endpoint existed,
 * `sent_at` appeared exactly once in the codebase — in a type definition — so
 * every notification the product has ever produced is still sitting in the
 * table unsent, and the §8 matrix described a delivery system with no delivery.
 *
 * The decisions live in `packages/logic`'s `planNotification`, not here. What
 * this route owns is the I/O: which rows, whose preferences, which devices, and
 * writing down what happened.
 *
 * Three properties worth stating, because each of them is a bug if it breaks:
 *
 *   idempotent    every row ends `sent_at` or `skipped_at`, and only pending
 *                 rows are read, so a re-run inside the same minute sends
 *                 nothing twice
 *   fail-soft     one member's dead subscription must not stop the sweep; every
 *                 failure is counted and the loop continues
 *   honest        `sent_at` is stamped only when a transport accepted it. A row
 *                 nobody could deliver stays pending or is skipped with a
 *                 reason — never marked sent, which would make this endpoint
 *                 the very thing it was written to remove
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** One batch. Large enough to clear a drop's worth, small enough to finish. */
const BATCH = 500;

interface Row {
  id: string;
  user_id: string;
  channel: "push" | "sms" | "email" | "inapp";
  template: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export async function GET(request: Request) {
  const denied = requireCron(request);
  if (denied) return denied;

  const now = new Date().toISOString();
  const db = createServiceClient();

  const { data: rowData, error: rowError } = await db
    .from("notifications")
    .select("id,user_id,channel,template,payload,created_at")
    .is("sent_at", null)
    .is("skipped_at", null)
    // Oldest first: the backlog is a queue, and a notification that has waited
    // longest is the one closest to no longer being true.
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (rowError) {
    /*
     * The most likely cause is 0022 not being applied — `skipped_at` would not
     * exist — so it is named. A sweep that fails with "column does not exist"
     * and no context is a sweep somebody spends an afternoon on.
     */
    const missingColumn = /skipped_at|column .* does not exist/i.test(rowError.message);
    return Response.json(
      {
        error: missingColumn
          ? "notifications has no skipped_at column — apply 0022_notifications_that_arrive.sql"
          : `notifications: ${rowError.message}`,
      },
      { status: 500 },
    );
  }

  const rows = (rowData ?? []) as Row[];
  if (rows.length === 0) {
    return Response.json({ ok: true, ranAt: now, pending: 0, sent: 0, skipped: 0, deferred: 0 });
  }

  const userIds = [...new Set(rows.map((row) => row.user_id))];

  const [prefsResult, subsResult] = await Promise.all([
    db
      .from("notification_prefs")
      .select("user_id,drop_push,drop_sms,fuse_warnings,email_updates,sms_opt_in_at")
      .in("user_id", userIds),
    db
      .from("push_subscriptions")
      .select("id,user_id,endpoint,p256dh,auth")
      .in("user_id", userIds)
      .is("expired_at", null),
  ]);

  if (subsResult.error && /push_subscriptions/i.test(subsResult.error.message)) {
    return Response.json(
      { error: "push_subscriptions is missing — apply 0022_notifications_that_arrive.sql" },
      { status: 500 },
    );
  }

  const prefsByUser = new Map<string, NotificationPrefs>(
    (prefsResult.data ?? []).map((row) => [row.user_id, row as NotificationPrefs]),
  );

  const subsByUser = new Map<string, PushTarget[]>();
  for (const sub of subsResult.data ?? []) {
    const list = subsByUser.get(sub.user_id) ?? [];
    list.push({ id: sub.id, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth });
    subsByUser.set(sub.user_id, list);
  }

  const names = await resolveCounterpartNames(db, rows);

  /*
   * Addresses, for the email channel. `profiles.email` only exists as of 0026,
   * so every member admitted before it has none — which is why a missing
   * address is a skip with a reason rather than a failure.
   */
  const { data: addressRows } = await db.from("profiles").select("id,email").in("id", userIds);
  const addressOf = new Map(
    (addressRows ?? [])
      .filter((row): row is { id: string; email: string } => Boolean(row.email))
      .map((row) => [row.id, row.email]),
  );

  /*
   * Season names and end dates, because §9.5's copy asks for both by name and a
   * missing substitution kills the whole email. One read for the sweep rather
   * than one per row.
   */
  const seasonIds = [
    ...new Set(
      rows
        .map((row) => (row.payload ?? {}).season_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const { data: seasonRows } = seasonIds.length
    ? await db.from("seasons").select("id,name,ends_at,timezone").in("id", seasonIds)
    : { data: [] };
  const seasonById = new Map((seasonRows ?? []).map((season) => [season.id, season]));

  /*
   * `push` is available only if there is a VAPID pair AND this member has a
   * device. The second half is per-row, so the transport map below carries the
   * global answer and the per-member check happens at send time — a member with
   * no device gets `defer`, because they may enable notifications tomorrow and
   * the planner's TTL is what eventually retires the row.
   */
  const configured = pushConfigured();
  const emailUp = emailConfigured();
  const transports = { push: configured, sms: false, email: emailUp };

  const sent: string[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const expiredSubs = new Set<string>();
  let deferred = 0;
  const failures: string[] = [];

  for (const row of rows) {
    const plan = planNotification(
      { template: row.template, channel: row.channel, createdAt: row.created_at },
      prefsByUser.get(row.user_id) ?? null,
      { now, timeZone: SEASON_DEFAULTS.timezone, transports },
    );

    if (plan.action === "skip") {
      skipped.push({ id: row.id, reason: plan.reason });
      continue;
    }
    if (plan.action === "defer") {
      deferred += 1;
      continue;
    }

    if (row.channel === "inapp") {
      // The row is the delivery. `lib/warnings.ts` and the inbox read these
      // directly; stamping `sent_at` is what marks it handed over.
      sent.push(row.id);
      continue;
    }

    if (row.channel === "email") {
      const to = addressOf.get(row.user_id);
      if (!to) {
        // 0026 added the column; anybody who applied before it has no address,
        // and no number of sweeps will give them one.
        skipped.push({ id: row.id, reason: "no-address" });
        continue;
      }

      const payload = row.payload ?? {};
      const season = typeof payload.season_id === "string"
        ? seasonById.get(payload.season_id)
        : undefined;

      const mail = renderEmail(row.template, payload, {
        seasonName: season?.name,
        seasonEndDate: season
          ? new Intl.DateTimeFormat("en-US", {
              month: "long",
              day: "numeric",
              timeZone: season.timezone ?? SEASON_DEFAULTS.timezone,
            }).format(new Date(season.ends_at))
          : undefined,
        seasonWeeks: SEASON_DEFAULTS.weeks,
        link: process.env.NEXT_PUBLIC_APP_URL,
      });

      if (!mail) {
        skipped.push({ id: row.id, reason: "no-copy" });
        continue;
      }

      const result = await sendEmail(to, mail);
      if (result.ok) {
        sent.push(row.id);
      } else if (result.permanent) {
        // Retrying cannot fix a rejected address.
        skipped.push({ id: row.id, reason: "bad-address" });
        failures.push(`${row.template} -> ${row.user_id}: ${result.detail}`);
      } else {
        deferred += 1;
        failures.push(`${row.template} -> ${row.user_id}: ${result.detail}`);
      }
      continue;
    }

    if (row.channel !== "push") {
      // SMS. Left explicit rather than assumed: the day a Twilio adapter lands
      // for notifications — Supabase's Verify is auth only — this is where it
      // goes.
      deferred += 1;
      continue;
    }

    const targets = subsByUser.get(row.user_id) ?? [];
    if (targets.length === 0) {
      // No device yet. Not a failure and not a skip — see the note above.
      deferred += 1;
      continue;
    }

    const message = renderNotification(row.template, row.payload ?? {}, {
      firstName: names.get(row.id),
      timeZone: SEASON_DEFAULTS.timezone,
    });

    if (!message) {
      skipped.push({ id: row.id, reason: "no-copy" });
      continue;
    }

    let delivered = false;
    for (const target of targets) {
      const result = await sendPush(target, message);
      if (result.ok) {
        delivered = true;
        continue;
      }
      if (result.expired) {
        expiredSubs.add(target.id);
        continue;
      }
      failures.push(`${row.template} -> ${target.id}: ${result.detail}`);
    }

    /*
     * One accepted endpoint is a delivered notification. A member with a phone
     * and a laptop where only the laptop is reachable has still been told, and
     * re-sending on the next sweep to chase the other device would mean the
     * phone gets it twice as soon as it comes back.
     */
    if (delivered) sent.push(row.id);
    else deferred += 1;
  }

  if (sent.length > 0) {
    const { error } = await db.from("notifications").update({ sent_at: now }).in("id", sent);
    if (error) failures.push(`stamping sent: ${error.message}`);
  }

  /*
   * Skips are written one reason at a time rather than in a single update,
   * because the reason is the useful half. A column that said only "skipped"
   * would leave nobody able to tell a copy gap from a missing provider.
   */
  const byReason = new Map<string, string[]>();
  for (const { id, reason } of skipped) {
    byReason.set(reason, [...(byReason.get(reason) ?? []), id]);
  }
  for (const [reason, ids] of byReason) {
    const { error } = await db
      .from("notifications")
      .update({ skipped_at: now, skip_reason: reason })
      .in("id", ids);
    if (error) failures.push(`stamping skip ${reason}: ${error.message}`);
  }

  if (expiredSubs.size > 0) {
    // Retired, not deleted: the member can see that a device stopped working,
    // and `prune_push_subscriptions` clears them on a schedule.
    const { error } = await db
      .from("push_subscriptions")
      .update({ expired_at: now })
      .in("id", [...expiredSubs]);
    if (error) failures.push(`expiring subscriptions: ${error.message}`);
  }

  if (sent.length > 0) {
    const { error } = await db
      .from("push_subscriptions")
      .update({ last_sent_at: now })
      .in("user_id", userIds)
      .is("expired_at", null);
    if (error) failures.push(`stamping last_sent_at: ${error.message}`);
  }

  for (const failure of failures) console.error(`[notification-sweep] ${failure}`);

  return Response.json({
    ok: true,
    ranAt: now,
    pending: rows.length,
    sent: sent.length,
    skipped: skipped.length,
    skippedBy: Object.fromEntries([...byReason].map(([reason, ids]) => [reason, ids.length])),
    deferred,
    expiredSubscriptions: expiredSubs.size,
    pushConfigured: configured,
    emailConfigured: emailUp,
    failures: failures.length,
  });
}

/**
 * The other person's first name, per notification.
 *
 * §9.4's push copy names them — "Maya said yes", "Last day with Maya" — and the
 * enqueuers store only ids, so this is the join that makes the copy renderable.
 * Batched into two reads for the whole sweep rather than one per row.
 */
async function resolveCounterpartNames(
  db: ReturnType<typeof createServiceClient>,
  rows: Row[],
): Promise<Map<string, string>> {
  const chatIds = new Set<string>();
  const connectIds = new Set<string>();

  for (const row of rows) {
    const payload = row.payload ?? {};
    const chat = payload.chat_id;
    const connect = payload.connect_id;
    if (typeof chat === "string") chatIds.add(chat);
    if (typeof connect === "string") connectIds.add(connect);
  }

  const [chats, connects] = await Promise.all([
    chatIds.size
      ? db.from("chats").select("id,user_a,user_b").in("id", [...chatIds])
      : Promise.resolve({ data: [], error: null }),
    connectIds.size
      ? db.from("connects").select("id,from_user,to_user").in("id", [...connectIds])
      : Promise.resolve({ data: [], error: null }),
  ]);

  const pairs = new Map<string, [string, string]>();
  for (const chat of chats.data ?? []) pairs.set(chat.id, [chat.user_a, chat.user_b]);
  for (const c of connects.data ?? []) pairs.set(c.id, [c.from_user, c.to_user]);

  const everyone = new Set<string>();
  for (const [a, b] of pairs.values()) {
    everyone.add(a);
    everyone.add(b);
  }
  if (everyone.size === 0) return new Map();

  const { data: profiles } = await db
    .from("profiles")
    .select("id,first_name")
    .in("id", [...everyone]);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.first_name as string]));

  const result = new Map<string, string>();
  for (const row of rows) {
    const payload = row.payload ?? {};
    const key =
      typeof payload.chat_id === "string"
        ? payload.chat_id
        : typeof payload.connect_id === "string"
          ? payload.connect_id
          : null;
    if (!key) continue;
    const pair = pairs.get(key);
    if (!pair) continue;
    // The recipient is one of the two; the name they need is the other one.
    const other = pair[0] === row.user_id ? pair[1] : pair[0];
    const name = nameById.get(other);
    if (name) result.set(row.id, name);
  }
  return result;
}
