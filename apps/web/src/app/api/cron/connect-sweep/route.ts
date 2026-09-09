import { createServiceClient } from "@noghost/db/service";
import { CONNECT_NUDGE_HOURS } from "@noghost/config";
import { expireConnect, needsNudge } from "@noghost/logic";
import { requireCron } from "@/lib/cron";

/**
 * `connect-sweep` — everything that happens to a connect because time passed.
 *
 * Two mechanics from §6.2, neither of which existed. `packages/logic` has had
 * `needsNudge` and `expireConnect` since the connect flow was built, both fully
 * unit-tested, and nothing has ever called either one. 0003 even carries a
 * partial index built for the query nobody wrote:
 *
 *   create index connects_nudge_idx on connects (created_at)
 *     where status = 'pending' and nudged_at is null;
 *
 * The second half is the serious one. `connect_status` has an `'expired'` value
 * that nothing anywhere set, so a note still pending when the season ended left
 * its sender with no answer at all — not a decline, not a note, nothing. That is
 * being ghosted, in the product whose §10 says the decline auto-notes are never
 * cut because they *are* the product.
 *
 * Not folded into `season-tick`, which §4.3 names for phase transitions and
 * which does not exist yet. Nudges are hourly work regardless of any phase, and
 * making the answer somebody is owed wait on an unbuilt job is how it stays
 * unbuilt.
 *
 * Idempotent, and deliberately claim-then-notify in both halves: the row is
 * updated first and only the rows that update are notified. A crash in between
 * therefore loses a notification rather than sending a second one — see the
 * note on the nudge for why that is the right way round.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH = 2000;

export async function GET(request: Request) {
  const denied = requireCron(request);
  if (denied) return denied;

  const now = new Date().toISOString();
  const db = createServiceClient();
  const failures: string[] = [];

  // -------------------------------------------------------------------------
  // 1. The answer a sender is owed when the season ends
  // -------------------------------------------------------------------------
  //
  // Before the nudges, and that ordering is load-bearing. A note still pending
  // in a season that has ended is both "unanswered for 72 hours" and "owed an
  // ending", and running the nudge first sent the recipient "they deserve an
  // answer either way" about a connect the same sweep then expired — chasing
  // somebody for an answer they can no longer give. Expiring first takes the
  // row out of `pending`, so the nudge query never sees it.

  const { data: endedSeasons, error: seasonError } = await db
    .from("seasons")
    .select("id")
    .lte("ends_at", now);

  if (seasonError) {
    return Response.json({ error: `seasons: ${seasonError.message}` }, { status: 500 });
  }

  const endedIds = (endedSeasons ?? []).map((season) => season.id);
  let expired: { id: string; from_user: string }[] = [];

  if (endedIds.length > 0) {
    /*
     * Read on `ends_at` rather than on `phase`. A season whose end date has
     * passed but which nobody has flipped to `closed` — likely, since §4.3's
     * `season-tick` does not exist yet — is still a season that ended, and the
     * sender is owed their answer either way.
     */
    const { data, error } = await db
      .from("connects")
      .update({ status: "expired", responded_at: now })
      .eq("status", "pending")
      .in("season_id", endedIds)
      .select("id,from_user")
      .limit(BATCH);

    if (error) {
      return Response.json({ error: `expire: ${error.message}` }, { status: 500 });
    }
    expired = data ?? [];

    for (const connect of expired) {
      /*
       * Which note to send comes from `expireConnect`, not from a string
       * literal here. It is the function that knows an expiry is not a decline
       * — `decline_auto` would tell the sender their note was read — and the
       * unit test that pins that down is worth nothing if the sweep hardcodes
       * the answer beside it.
       */
      const outcome = expireConnect(connect.from_user);
      const note = outcome.effects.find((effect) => effect.kind === "system_message");

      /*
       * The status change is the answer; this is only the ping.
       *
       * The inbox renders the closing note from `connects.status`, not from a
       * notification row — so a notification lost here means the sender is not
       * *alerted*, never that they are left wondering. That is what makes
       * claiming the row first safe.
       */
      const { error: notifyError } = await db.rpc("enqueue_notification", {
        p_user: connect.from_user,
        p_channel: "inapp",
        p_template: "connect_declined",
        p_payload: { connect_id: connect.id, template_id: note?.templateId ?? "expired_auto" },
      });
      if (notifyError) failures.push(`expire ${connect.id}: ${notifyError.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // 2. The single nudge, at 72 hours
  // -------------------------------------------------------------------------

  /*
   * Candidates are narrowed in SQL and *decided* by `needsNudge`, rather than
   * the rule being written twice. The `lte` below is only an index-friendly
   * prefilter over `connects_nudge_idx`; if the definition of "earned its
   * nudge" ever changes, it changes in `packages/logic` and this follows.
   */
  const nudgeCutoff = new Date(Date.now() - CONNECT_NUDGE_HOURS * 3_600_000).toISOString();

  const { data: candidates, error: candidateError } = await db
    .from("connects")
    .select("id,to_user,status,created_at,nudged_at")
    .eq("status", "pending")
    .is("nudged_at", null)
    .lte("created_at", nudgeCutoff)
    .limit(BATCH);

  if (candidateError) {
    return Response.json({ error: `nudge: ${candidateError.message}` }, { status: 500 });
  }

  const due = (candidates ?? []).filter((row) =>
    needsNudge(
      { status: row.status, createdAt: row.created_at, nudgedAt: row.nudged_at },
      now,
    ),
  );

  /*
   * The update is the claim, and `nudged_at is null` is still in the filter —
   * so two overlapping runs cannot both take the same row, and what comes back
   * is exactly what this run owes somebody a message about.
   *
   * Stamped before the notification rather than after, which is the opposite of
   * what you would normally want. §6.2 says "one gentle nudge" and §3.3 bans
   * nagging outright — so a nudge lost to a crash is a silence, while a nudge
   * sent twice is the product doing the one thing it promises never to do.
   */
  const nudged: { id: string; to_user: string }[] = [];
  if (due.length > 0) {
    const { data, error } = await db
      .from("connects")
      .update({ nudged_at: now })
      .is("nudged_at", null)
      .in("id", due.map((row) => row.id))
      .select("id,to_user");

    if (error) {
      return Response.json({ error: `nudge: ${error.message}` }, { status: 500 });
    }
    nudged.push(...(data ?? []));
  }

  for (const connect of nudged) {
    const { error } = await db.rpc("enqueue_notification", {
      p_user: connect.to_user,
      p_channel: "push",
      p_template: "connect_nudge",
      // Never says who it is from. §6.2: the nudge goes to the recipient, and
      // the sender is never told their note is sitting unread — that would be
      // pressure rather than information.
      p_payload: { connect_id: connect.id },
    });
    if (error) failures.push(`nudge ${connect.id}: ${error.message}`);
  }

  for (const failure of failures) console.error(`[connect-sweep] ${failure}`);

  return Response.json({
    ok: true,
    ranAt: now,
    nudged: nudged.length,
    expired: expired.length,
    endedSeasons: endedIds.length,
    failures: failures.length,
  });
}
