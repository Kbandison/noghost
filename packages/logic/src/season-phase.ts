import { COHORT_LOCK_DAYS, FINALE_WEEK_DAYS } from "@noghost/config";
import type { SeasonPhase } from "@noghost/types";

/**
 * Where a season is in its own life — spec §4.3's `season-tick`.
 *
 * Nothing has ever written `seasons.phase`. It is read in three places that
 * matter: the application funnel requires `applications_open`, and both drop
 * crons filter `phase in ('live','finale_week')`. So a season sat in whatever
 * phase it was created with, forever — which means the drop, the mechanic the
 * entire product is built around, could never begin. The season never started.
 *
 * Pure, like everything here. "Now" is an argument.
 */

export interface SeasonDates {
  phase: SeasonPhase;
  /** Null on a season whose applications have no opening date yet. */
  applications_open_at: string | null;
  starts_at: string;
  ends_at: string;
}

/**
 * Phases in order. A season only ever moves down this list — see `nextPhase`.
 */
const ORDER: SeasonPhase[] = [
  "draft",
  "applications_open",
  "pre_season",
  "live",
  "finale_week",
  "closed",
];

const rank = (phase: SeasonPhase): number => ORDER.indexOf(phase);

const days = (n: number) => n * 86_400_000;

/**
 * The phase the calendar says a season is in, ignoring the phase it is stored
 * with.
 *
 * `draft` comes back for a season whose applications have not opened yet — it
 * is the enum's only pre-open value, so "not open yet" and "not published yet"
 * share a name. That ambiguity is contained entirely by `nextPhase`, which
 * never advances *from* draft and never moves backwards *into* it.
 */
export function phaseForDate(season: SeasonDates, now: string): SeasonPhase {
  const at = Date.parse(now);
  const starts = Date.parse(season.starts_at);
  const ends = Date.parse(season.ends_at);

  if (at >= ends) return "closed";
  if (at >= ends - days(FINALE_WEEK_DAYS)) return "finale_week";
  if (at >= starts) return "live";
  if (at >= starts - days(COHORT_LOCK_DAYS)) return "pre_season";

  /*
   * Before the lock, a season is taking applications — but only once its
   * opening date has passed. A season with no opening date at all has not been
   * scheduled to open, so it stays where it is rather than opening by default.
   */
  const opens = season.applications_open_at ? Date.parse(season.applications_open_at) : null;
  if (opens !== null && at >= opens) return "applications_open";
  return "draft";
}

/**
 * The phase to move a season to, or null to leave it alone.
 *
 * Two rules make this safe to run on a schedule against every season in the
 * table:
 *
 * **A draft never advances by itself.** §7.3 gives the admin console "phase
 * transitions (with confirm gates)", and publishing a season is exactly that
 * kind of decision. Somebody drafting next season with placeholder dates must
 * not have applications opened for them by a cron at 6 AM.
 *
 * **A season never moves backwards.** The phase is derived from the calendar,
 * but only applied when it is further along than where the season already is.
 * An admin who closed a season early has made a decision, and a tick that
 * reopened it the next morning would be overruling a person with a clock.
 */
export function nextPhase(season: SeasonDates, now: string): SeasonPhase | null {
  if (season.phase === "draft") return null;

  const target = phaseForDate(season, now);
  return rank(target) > rank(season.phase) ? target : null;
}

/**
 * Notifications a transition owes the cohort — §8's two season-wide templates,
 * neither of which anything has ever enqueued.
 *
 * Keyed on *arriving at* a phase rather than on the pair, because a season that
 * missed a tick and jumps `pre_season` → `finale_week` still owes both messages:
 * the members were never told it started either.
 */
export function announcementsFor(from: SeasonPhase, to: SeasonPhase): string[] {
  const crossed = ORDER.slice(rank(from) + 1, rank(to) + 1);
  const templates: string[] = [];
  if (crossed.includes("live")) templates.push("season_start");
  if (crossed.includes("finale_week")) templates.push("season_finale");
  return templates;
}
