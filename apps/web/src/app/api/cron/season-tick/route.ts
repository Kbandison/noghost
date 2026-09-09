import { createServiceClient } from "@noghost/db/service";
import { announcementsFor, nextPhase, type SeasonDates } from "@noghost/logic";
import type { SeasonPhase } from "@noghost/types";
import { requireCron } from "@/lib/cron";

/**
 * `season-tick` — spec §4.3's last unbuilt job. Daily, 6 AM ET.
 *
 * Nothing has ever written `seasons.phase`. It is read in three places that
 * decide whether the product works at all: the application funnel requires
 * `applications_open`, and both `generate-drops` and `release-drops` filter
 * `phase in ('live','finale_week')`. A season therefore sat in whatever phase it
 * was created with — the seed makes one in `applications_open` — and never
 * became live, so no drop was ever built and none was ever released. The
 * mechanic the whole product is named around could not start.
 *
 * The decision is `nextPhase` in `packages/logic`, which only ever moves a
 * season forward and never publishes a draft. This route does the I/O and the
 * announcements.
 *
 * Daily rather than hourly, and that is not arbitrary: §8 triggers
 * `season_start` on "`starts_at` morning", so the job that sends it runs in the
 * morning. Scheduled twice in UTC for the same reason `release-drops` is —
 * 6 AM ET is 10:00 or 11:00 UTC depending on daylight saving, and the run is
 * idempotent, so the second one is a no-op nine months of the year.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface SeasonRow extends SeasonDates {
  id: string;
  name: string;
}

export async function GET(request: Request) {
  const denied = requireCron(request);
  if (denied) return denied;

  const now = new Date().toISOString();
  const db = createServiceClient();
  const failures: string[] = [];

  const { data: seasonRows, error: seasonError } = await db
    .from("seasons")
    .select("id,name,phase,applications_open_at,starts_at,ends_at")
    // Every season, including closed ones — `nextPhase` is what decides, and
    // filtering here would duplicate its rules in a place that cannot be tested.
    .limit(500);

  if (seasonError) {
    return Response.json({ error: `seasons: ${seasonError.message}` }, { status: 500 });
  }

  const moved: { season: string; from: SeasonPhase; to: SeasonPhase; told: number }[] = [];

  for (const row of (seasonRows ?? []) as SeasonRow[]) {
    const to = nextPhase(row, now);
    if (!to) continue;

    /*
     * Guarded on the phase it was read in. Two overlapping runs — the 10:00 and
     * 11:00 UTC pair, or a retry — cannot both apply the same transition, so
     * the announcements below are sent once even though the update is not.
     */
    const { data: updated, error: updateError } = await db
      .from("seasons")
      .update({ phase: to })
      .eq("id", row.id)
      .eq("phase", row.phase)
      .select("id");

    if (updateError) {
      failures.push(`${row.name}: ${updateError.message}`);
      continue;
    }
    if ((updated ?? []).length === 0) continue;

    const templates = announcementsFor(row.phase, to);
    let told = 0;

    if (templates.length > 0) {
      /*
       * Announced to the people actually in the season, read from
       * `season_members` rather than from `applications` — an admitted
       * application that was never claimed and paid for is not somebody whose
       * season is starting.
       */
      const { data: members, error: memberError } = await db
        .from("season_members")
        .select("user_id")
        .eq("season_id", row.id)
        .limit(5000);

      if (memberError) {
        failures.push(`${row.name} members: ${memberError.message}`);
      } else {
        for (const template of templates) {
          for (const channel of ["push", "email"] as const) {
            for (const member of members ?? []) {
              const { error } = await db.rpc("enqueue_notification", {
                p_user: member.user_id,
                p_channel: channel,
                p_template: template,
                p_payload: { season_id: row.id, season_name: row.name },
              });
              if (error) failures.push(`${template}/${channel}: ${error.message}`);
              else told += 1;
            }
          }
        }
      }
    }

    moved.push({ season: row.name, from: row.phase, to, told });
  }

  for (const failure of failures) console.error(`[season-tick] ${failure}`);

  return Response.json({
    ok: true,
    ranAt: now,
    seasons: seasonRows?.length ?? 0,
    moved,
    failures: failures.length,
  });
}
