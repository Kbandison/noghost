import type { SeasonPhase } from "@noghost/types";

/**
 * When a drop is built and when it becomes visible — spec §4.3 and §6.1.
 *
 * Every function here takes `now` and the season's timezone, and answers in the
 * season's local calendar. That matters more than it looks: `drops.drop_date`
 * is a `date`, "up to three profiles land at 8:00 PM" is the product's headline
 * promise, and a Vercel cron only speaks UTC.
 *
 * Pure, like everything else in this package — no `Date.now()`.
 */

export interface DropSchedule {
  /** IANA zone from `seasons.timezone`. */
  timezone: string;
  /** `seasons.drop_time`, a Postgres `time` — "20:00:00" or "20:00". */
  dropTime: string;
}

/**
 * The season-local wall clock at `now`, as plain numbers.
 *
 * `Intl.DateTimeFormat` is the only correct way to do this: it carries the full
 * IANA database, so it knows that America/New_York was UTC-4 in July and UTC-5
 * in December without anyone hardcoding an offset.
 */
export function localParts(
  now: string,
  timezone: string,
): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(now));

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return {
    // en-CA gives YYYY-MM-DD, which is also what a Postgres `date` wants.
    date: `${get("year")}-${get("month")}-${get("day")}`,
    // Some zones format midnight as hour 24 under hour12:false.
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
  };
}

/** The `drop_date` a drop built at `now` belongs to. */
export function dropDateFor(now: string, timezone: string): string {
  return localParts(now, timezone).date;
}

/** Minutes past local midnight, from a Postgres `time` like "20:00:00". */
export function dropTimeMinutes(dropTime: string): number {
  const [hour = "0", minute = "0"] = dropTime.split(":");
  return Number(hour) * 60 + Number(minute);
}

/**
 * Has the season's drop time passed today, locally?
 *
 * This is the DST guard, and it is the reason the release cron is scheduled at
 * *two* UTC hours rather than one. A Vercel cron schedule is UTC with no zone,
 * so `0 0 * * *` is 8:00 PM in New York during EDT and 7:00 PM during EST — and
 * "profiles land at 8:00 PM" is the product's one scheduling promise. Firing at
 * both candidate hours and refusing the early one keeps 8:00 PM meaning 8:00 PM
 * on both sides of the November changeover. The wasted invocation costs nothing
 * because the job is idempotent anyway.
 */
export function isReleaseDue(now: string, schedule: DropSchedule): boolean {
  const { hour, minute } = localParts(now, schedule.timezone);
  return hour * 60 + minute >= dropTimeMinutes(schedule.dropTime);
}

/**
 * Should this season be dropping at all?
 *
 * `pre_season` deliberately does not serve. Members have paid and can see their
 * profile, but the cohort is still forming, and a drop built from a half-full
 * pool would burn irreplaceable first impressions on whoever happened to claim
 * early. Day one is when everyone starts together — that is the whole premise.
 */
export function isSeasonServing(
  phase: SeasonPhase,
  startsAt: string,
  endsAt: string,
  now: string,
): boolean {
  if (phase !== "live" && phase !== "finale_week") return false;
  const at = Date.parse(now);
  return at >= Date.parse(startsAt) && at < Date.parse(endsAt);
}

/**
 * Why a run did nothing. Returned rather than logged, so the cron's HTTP body
 * says which gate stopped it — "0 drops built" alone is indistinguishable from
 * a broken query.
 */
export type SkipReason =
  | "no-season"
  | "season-not-serving"
  | "before-drop-time"
  | "already-done";
