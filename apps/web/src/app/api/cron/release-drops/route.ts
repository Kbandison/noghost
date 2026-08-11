import { createServiceClient } from "@noghost/db/service";
import { dropDateFor, isReleaseDue, isSeasonServing } from "@noghost/logic";
import { requireCron } from "@/lib/cron";

/**
 * `release-drops` — spec §4.3, the 8:00 PM release.
 *
 * Flips tonight's drops visible and tells people. This is the moment the
 * product is named after, so it does as little as possible: one update and a
 * queue of notifications, with the expensive scoring already done by
 * `generate-drops` half an hour earlier.
 *
 * Idempotent through the `released_at is null` filter — the update is the gate
 * and it returns exactly the rows that transitioned, so a re-run releases
 * nothing and notifies nobody.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const denied = requireCron(request);
  if (denied) return denied;

  const now = new Date().toISOString();
  const db = createServiceClient();

  const { data: seasons, error: seasonError } = await db
    .from("seasons")
    .select("id,name,phase,starts_at,ends_at,timezone,drop_time")
    .in("phase", ["live", "finale_week"]);

  if (seasonError) {
    return Response.json({ error: `seasons: ${seasonError.message}` }, { status: 500 });
  }

  const summary: Record<string, unknown>[] = [];

  for (const season of seasons ?? []) {
    if (!isSeasonServing(season.phase, season.starts_at, season.ends_at, now)) {
      summary.push({ season: season.name, skipped: "season-not-serving" });
      continue;
    }

    /*
     * The DST guard. This endpoint is scheduled at both UTC hours that can be
     * 8:00 PM in a US Eastern season, and refuses the one that is 7:00 PM
     * locally — see `isReleaseDue`. Releasing an hour early in November would
     * break the only scheduling promise the product makes.
     */
    if (!isReleaseDue(now, { timezone: season.timezone, dropTime: season.drop_time })) {
      summary.push({ season: season.name, skipped: "before-drop-time" });
      continue;
    }

    const dropDate = dropDateFor(now, season.timezone);

    const { data: released, error: releaseError } = await db
      .from("drops")
      .update({ released_at: now })
      .eq("season_id", season.id)
      .eq("drop_date", dropDate)
      .is("released_at", null)
      .select("id,user_id");

    if (releaseError) {
      summary.push({ season: season.name, dropDate, error: releaseError.message });
      continue;
    }

    if (!released || released.length === 0) {
      summary.push({ season: season.name, dropDate, released: 0, skipped: "already-done" });
      continue;
    }

    /*
     * Only people who actually got cards are told.
     *
     * A quiet night is honest and has its own screen (§9.6), but pushing
     * "tonight's drop is live 👻" to someone who will open it and find nothing
     * turns an honest empty state into a broken promise. The drop row is still
     * released either way, so the screen is there when they look.
     */
    const { data: cardRows, error: cardError } = await db
      .from("drop_cards")
      .select("drop_id")
      .in(
        "drop_id",
        released.map((row) => row.id),
      )
      .limit(5000);
    if (cardError) {
      summary.push({ season: season.name, dropDate, released: released.length, error: cardError.message });
      continue;
    }

    const withCards = new Set((cardRows ?? []).map((row) => row.drop_id));
    const recipients = released.filter((row) => withCards.has(row.id)).map((row) => row.user_id);
    const quiet = released.length - recipients.length;

    const { data: prefRows } = await db
      .from("notification_prefs")
      .select("user_id,drop_push,drop_sms,sms_opt_in_at")
      .in("user_id", recipients);
    const prefs = new Map((prefRows ?? []).map((row) => [row.user_id, row]));

    let pushed = 0;
    let texted = 0;

    for (const userId of recipients) {
      const pref = prefs.get(userId);
      // No row means defaults, and the column defaults are push on, SMS off.
      const wantsPush = pref?.drop_push ?? true;
      // TCPA (§9.8): SMS needs the separately-recorded opt-in timestamp, not
      // just the toggle. A toggle with no `sms_opt_in_at` is not consent.
      const wantsSms = Boolean(pref?.drop_sms && pref?.sms_opt_in_at);

      /*
       * `drop_live` is `required: true` in §8's matrix, and the UI is supposed
       * to keep at least one channel on. If a row somehow has both off, send
       * the push anyway — a member who cannot be told their drop is live has
       * no way to use the product, and silently honouring an impossible
       * preference is worse than the extra notification.
       */
      const channels: ("push" | "sms")[] = [];
      if (wantsPush || !wantsSms) channels.push("push");
      if (wantsSms) channels.push("sms");

      for (const channel of channels) {
        const { error } = await db.rpc("enqueue_notification", {
          p_user: userId,
          p_channel: channel,
          p_template: "drop_live",
          p_payload: { drop_date: dropDate, season_id: season.id },
        });
        if (error) {
          console.error(`[release-drops] notify ${userId} (${channel}): ${error.message}`);
          continue;
        }
        if (channel === "push") pushed += 1;
        else texted += 1;
      }
    }

    summary.push({
      season: season.name,
      dropDate,
      released: released.length,
      quietNights: quiet,
      pushed,
      texted,
    });
  }

  return Response.json({ ok: true, ranAt: now, seasons: summary });
}
