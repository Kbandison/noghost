import { createServiceClient } from "@noghost/db/service";
import { buildDrop, dropDateFor, isSeasonServing } from "@noghost/logic";
import { requireCron } from "@/lib/cron";
import { loadSeasonPool } from "@/lib/drop-pool";

/**
 * `generate-drops` — spec §4.3, nightly before the release.
 *
 * Builds tonight's cards for every active member and leaves them invisible:
 * `drops.released_at` stays null until `release-drops` flips it, and RLS keys
 * off that column, so nothing built here can leak early.
 *
 * Building and releasing are two jobs on purpose. The build is the expensive,
 * failure-prone half — hundreds of members scored against the whole pool — and
 * separating it means a slow build eats its own half-hour of slack rather than
 * pushing 8:00 PM back for everybody.
 *
 * Idempotent: a member who already has a drop row for tonight is skipped
 * outright, never rebuilt. Rebuilding would be worse than a no-op — the pool
 * shifts through the evening, so a second run could hand someone a different
 * set of cards than the ones they were already looking at.
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
    .select("id,name,phase,starts_at,ends_at,timezone,drop_time,drop_max,encore_start_week")
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

    const dropDate = dropDateFor(now, season.timezone);

    try {
      const { pool, inputFor } = await loadSeasonPool(db, season, now);

      // Who already has tonight's drop. Read before building so a re-run does
      // no work at all, rather than building and discarding.
      const { data: builtRows, error: builtError } = await db
        .from("drops")
        .select("user_id")
        .eq("season_id", season.id)
        .eq("drop_date", dropDate)
        .limit(5000);
      if (builtError) throw new Error(`existing drops: ${builtError.message}`);
      const alreadyBuilt = new Set((builtRows ?? []).map((row) => row.user_id));

      /*
       * Paused members are not served. `buildDrop` filters non-active people
       * out of everyone else's pool, but it says nothing about the viewer —
       * a paused member is exactly someone who asked not to receive this.
       */
      const viewers = pool.filter(
        (member) => member.status === "active" && !alreadyBuilt.has(member.id),
      );

      const plans = viewers.map((viewer) => ({
        viewer,
        result: buildDrop(inputFor(viewer, dropDate, now)),
      }));

      if (plans.length === 0) {
        summary.push({
          season: season.name,
          dropDate,
          built: 0,
          skipped: "already-done",
          members: pool.length,
        });
        continue;
      }

      /*
       * `ignoreDuplicates` plus `.select()` returns only the rows this run
       * actually inserted. The unique index on (user_id, season_id, drop_date)
       * is what makes two overlapping runs safe: the loser inserts nothing and
       * therefore writes no cards.
       */
      const { data: inserted, error: dropError } = await db
        .from("drops")
        .upsert(
          plans.map(({ viewer }) => ({
            season_id: season.id,
            user_id: viewer.id,
            drop_date: dropDate,
          })),
          { onConflict: "user_id,season_id,drop_date", ignoreDuplicates: true },
        )
        .select("id,user_id");
      if (dropError) throw new Error(`insert drops: ${dropError.message}`);

      const dropIdFor = new Map((inserted ?? []).map((row) => [row.user_id, row.id]));

      const cards = plans.flatMap(({ viewer, result }) => {
        const dropId = dropIdFor.get(viewer.id);
        if (!dropId) return [];
        return result.cards.map((card) => ({
          drop_id: dropId,
          shown_profile_id: card.profileId,
          is_encore: card.isEncore,
        }));
      });

      if (cards.length > 0) {
        const { error: cardError } = await db
          .from("drop_cards")
          .upsert(cards, { onConflict: "drop_id,shown_profile_id", ignoreDuplicates: true });
        if (cardError) throw new Error(`insert cards: ${cardError.message}`);
      }

      /*
       * A quiet night is a real outcome, not a failure — §6.1 says serving
       * fewer is correct as the pool thins, and §9.6 gives it its own screen.
       * Counted separately so a rising number is visible as the signal it is:
       * the cohort's matchable pool is running out.
       */
      const quiet = plans.filter(({ result }) => result.quietNight).length;
      const served = plans.length - quiet;

      summary.push({
        season: season.name,
        dropDate,
        members: pool.length,
        built: dropIdFor.size,
        cards: cards.length,
        quietNights: quiet,
        averageCards: served > 0 ? Number((cards.length / served).toFixed(2)) : 0,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[generate-drops] ${season.name}: ${message}`);
      summary.push({ season: season.name, dropDate, error: message });
    }
  }

  return Response.json({ ok: true, ranAt: now, seasons: summary });
}
