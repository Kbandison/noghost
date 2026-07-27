/**
 * Time helpers.
 *
 * Every function in this package takes "now" as an argument. Nothing here
 * calls `Date.now()`. That is what makes the Phase 7 season simulation
 * possible — 56 days can be fast-forwarded in a test to assert that no ending
 * is ever silent (spec §10 Phase 7).
 */

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export function toMs(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Invalid timestamp: ${iso}`);
  return ms;
}

export function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

export function addHours(iso: string, hours: number): string {
  return toIso(toMs(iso) + hours * HOUR_MS);
}

export function addDays(iso: string, days: number): string {
  return toIso(toMs(iso) + days * DAY_MS);
}

export function hoursBetween(from: string, to: string): number {
  return (toMs(to) - toMs(from)) / HOUR_MS;
}

export function daysBetween(from: string, to: string): number {
  return (toMs(to) - toMs(from)) / DAY_MS;
}

export function isAtOrAfter(a: string, b: string): boolean {
  return toMs(a) >= toMs(b);
}

export function earliest(...isos: string[]): string {
  return toIso(Math.min(...isos.map(toMs)));
}

/**
 * Which season week a moment falls in, 1-indexed. Day one of the season is
 * week 1; encore eligibility (spec §6.1) and the encore banner's
 * "you passed on them in week {{WEEK}}" both read from this.
 */
export function seasonWeek(seasonStartsAt: string, at: string): number {
  const days = Math.floor(daysBetween(seasonStartsAt, at));
  if (days < 0) return 0;
  return Math.floor(days / 7) + 1;
}

/** Age in whole years on a given date — spec §5: age is computed, never stored. */
export function ageOn(birthdate: string, on: string): number {
  const b = new Date(`${birthdate.slice(0, 10)}T00:00:00.000Z`);
  const d = new Date(on);
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  const monthDelta = d.getUTCMonth() - b.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && d.getUTCDate() < b.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/** `YYYY-MM-DD` for a timestamp, in the season's timezone. */
export function dateKeyInZone(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Hour of day (0–23) for a timestamp, in the season's timezone. */
export function hourInZone(iso: string, timeZone: string): number {
  const value = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
  }).format(new Date(iso));
  return Number.parseInt(value, 10) % 24;
}

/**
 * Quiet hours — spec §8. Nothing sends 11 PM–9 AM local; a sweep that fires
 * overnight queues for morning delivery instead of waking anyone up.
 */
export function isQuietHour(iso: string, timeZone: string, startHour = 23, endHour = 9): boolean {
  const hour = hourInZone(iso, timeZone);
  return startHour > endHour ? hour >= startHour || hour < endHour : hour >= startHour && hour < endHour;
}
