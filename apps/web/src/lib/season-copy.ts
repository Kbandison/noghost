import type { PublicSeasonStats } from "@noghost/db";
import { type CopyVars, formatCents } from "@noghost/config";
import { formatDate } from "./utils";

/**
 * Binds a season row to the `{{VAR}}` slots the §9 copy library uses.
 *
 * Components never interpolate brand or season strings themselves — they call
 * `interpolate(SOME_COPY, vars)` with this, so the copy stays verbatim and the
 * numbers stay real.
 */
export function seasonVars(season: PublicSeasonStats): CopyVars {
  const weeks = Math.round(
    (Date.parse(season.endsAt) - Date.parse(season.startsAt)) / (7 * 24 * 60 * 60 * 1000),
  );

  return {
    SEASON_NAME: season.name,
    CITY: season.city,
    MEMBER_CAP: season.memberCap,
    SEATS_REMAINING: season.seatsRemaining,
    SEASON_WEEKS: weeks,
    APPS_CLOSE_DATE: formatDate(season.applicationsCloseAt, season.timezone),
    SEASON_START_DATE: formatDate(season.startsAt, season.timezone),
    SEASON_END_DATE: formatDate(season.endsAt, season.timezone),
    PRICE_EARLY: formatCents(season.priceEarlyCents),
    PRICE_STANDARD: formatCents(season.priceStandardCents),
    EARLY_BIRD_CAP: season.earlyBirdCap,
    MIN_AGE: 21,
  };
}
