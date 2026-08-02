import { createServiceClient } from "@noghost/db/service";
import { planClaimSweep, type ClaimApplication } from "@noghost/logic";
import { requireCron } from "@/lib/cron";

/**
 * `claim-sweep` — spec §4.3, hourly.
 *
 * Expires lapsed claim windows, refills the freed seats from the waitlist, and
 * nudges anyone close to their deadline.
 *
 * Runs as the service role because it acts for the system, not for a person.
 * `advance_application` allows that path deliberately — with no `auth.uid()`
 * the audit rows are attributed to the system rather than to a reviewer, which
 * is the truth about who did it.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = requireCron(request);
  if (denied) return denied;

  const now = new Date().toISOString();
  const db = createServiceClient();

  // Any season that can hold members. A closed season's windows are moot, and
  // a draft season has nobody in it.
  const { data: seasons, error: seasonError } = await db
    .from("seasons")
    .select("id,name,member_cap,claim_hours")
    .in("phase", ["applications_open", "pre_season", "live", "finale_week"]);

  if (seasonError) {
    return Response.json({ error: `seasons: ${seasonError.message}` }, { status: 500 });
  }

  const summary: Record<string, unknown>[] = [];

  for (const season of seasons ?? []) {
    const { data: rows, error } = await db
      .from("applications")
      .select("id,user_id,status,claim_deadline,waitlist_position,created_at")
      .eq("season_id", season.id)
      .in("status", ["admitted", "claimed", "waitlisted"])
      .limit(2000);

    if (error) {
      summary.push({ season: season.name, error: error.message });
      continue;
    }

    const applications: ClaimApplication[] = (rows ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      status: row.status,
      claimDeadline: row.claim_deadline,
      waitlistPosition: row.waitlist_position,
      createdAt: row.created_at,
    }));

    const plan = planClaimSweep(applications, season.member_cap, now);

    // Expire first, so the seats those release are genuinely free before
    // anything is promoted into them.
    let expired = 0;
    for (const application of plan.expire) {
      const { error: rpcError } = await db.rpc("advance_application", {
        p_application_id: application.id,
        p_new_status: "expired",
        p_reason: "Claim window lapsed",
      });
      if (rpcError) {
        console.error(`[claim-sweep] expire ${application.id}: ${rpcError.message}`);
        continue;
      }
      expired += 1;
    }

    let promoted = 0;
    for (const application of plan.promote) {
      const { error: rpcError } = await db.rpc("advance_application", {
        p_application_id: application.id,
        p_new_status: "admitted",
      });
      if (rpcError) {
        console.error(`[claim-sweep] promote ${application.id}: ${rpcError.message}`);
        continue;
      }
      promoted += 1;
    }

    /*
     * Reminders are deduped against what's already queued.
     *
     * This job runs hourly and the reminder horizon is twelve hours, so
     * without this check one applicant gets twelve identical texts about a
     * deadline they already know about. `claim_reminder` is a `required: true`
     * channel in §8's matrix, which makes it exactly the notification a member
     * cannot mute — so it had better not repeat.
     */
    let reminded = 0;
    if (plan.remind.length > 0) {
      const { data: existing } = await db
        .from("notifications")
        .select("user_id")
        .eq("template", "claim_reminder")
        .in(
          "user_id",
          plan.remind.map((a) => a.userId),
        );

      const alreadySent = new Set((existing ?? []).map((n) => n.user_id));

      for (const application of plan.remind) {
        if (alreadySent.has(application.userId)) continue;
        const { error: rpcError } = await db.rpc("enqueue_notification", {
          p_user: application.userId,
          p_channel: "sms",
          p_template: "claim_reminder",
          p_payload: { application_id: application.id, deadline: application.claimDeadline },
        });
        if (rpcError) {
          console.error(`[claim-sweep] remind ${application.id}: ${rpcError.message}`);
          continue;
        }
        reminded += 1;
      }
    }

    summary.push({
      season: season.name,
      expired,
      promoted,
      reminded,
      seatsLeftOver: plan.seatsLeftOver,
    });
  }

  return Response.json({ ok: true, ranAt: now, seasons: summary });
}
