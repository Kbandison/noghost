/**
 * Cohort health — spec §7.3, which calls it "the Season Two design input".
 *
 * Pure aggregation over rows the product already records. Nothing here queries;
 * the console reads and hands the rows in, so the arithmetic can be tested
 * against fixtures rather than against a live season that changes under it.
 *
 * Two honesty rules run through this file:
 *
 *   A rate with a tiny denominator is not a rate. "100% accept rate" from one
 *   connect is noise, and a screen that is meant to shape Season Two should not
 *   hand somebody a number that confident. Rates are null below a floor and the
 *   console renders that as "—" rather than zero.
 *
 *   Nothing is inferred that is not recorded. There is no events table, so DAU
 *   is defined as members who did one of the things the schema stores, and that
 *   definition is stated rather than implied — see `activeMembers`.
 */

export interface DayRow {
  /** YYYY-MM-DD in the season's timezone. */
  day: string;
}

export interface MetricsInput {
  /** One per member per night a drop was released. */
  drops: { day: string; userId: string }[];
  /** Every card shown in those drops, with what the member did. */
  cards: { day: string; action: "pending" | "connected" | "passed" }[];
  connects: { day: string; status: "pending" | "accepted" | "declined" | "expired"; fromUser: string }[];
  /** Opened and closed, so concurrency can be reconstructed per day. */
  chats: { openedDay: string; closedDay: string | null; state: string }[];
  dates: { day: string; status: "proposed" | "confirmed" | "cancelled" | "completed" }[];
  closures: { day: string; templateId: string; systemSent: boolean }[];
  graduations: { day: string; status: "proposed" | "confirmed" | "declined" }[];
  /** Anything a member did that the schema records — see `activeMembers`. */
  activity: { day: string; userId: string }[];
}

export interface DayMetrics {
  day: string;
  dropsServed: number;
  cardsShown: number;
  connectsSent: number;
  /** connects ÷ cards shown. Null when there is not enough to divide. */
  connectRate: number | null;
  connectsAccepted: number;
  /** accepted ÷ answered. Null below the floor. */
  acceptRate: number | null;
  chatsOpen: number;
  datesProposed: number;
  datesConfirmed: number;
  datesCompleted: number;
  closedByFuse: number;
  closedByUser: number;
  graduations: number;
  activeMembers: number;
}

export interface Concurrency {
  p50: number;
  p90: number;
  max: number;
}

/**
 * Below this a rate is noise. Chosen because the smallest cohort §11 describes
 * is 300 people and a day with fewer than ten answered connects is a day the
 * season was not really running — a holiday, an outage, the first evening.
 */
export const RATE_FLOOR = 10;

const rate = (numerator: number, denominator: number): number | null =>
  denominator < RATE_FLOOR ? null : numerator / denominator;

const tally = <T>(rows: T[], day: (row: T) => string): Map<string, T[]> => {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const key = day(row);
    const list = out.get(key);
    if (list) list.push(row);
    else out.set(key, [row]);
  }
  return out;
};

/**
 * Every calendar day from `from` to `to` inclusive, so a quiet day appears as a
 * row of zeros rather than a gap in the chart.
 *
 * Named `dayRange` rather than `daysBetween` because `time.ts` already exports
 * that, and it returns a *count*. Two exports with one name differing only in
 * what they return is how somebody averages a list of strings.
 */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let at = Date.parse(`${from}T00:00:00Z`); at <= end; at += 86_400_000) {
    out.push(new Date(at).toISOString().slice(0, 10));
  }
  return out;
}

export function dailyMetrics(input: MetricsInput, days: string[]): DayMetrics[] {
  const drops = tally(input.drops, (r) => r.day);
  const cards = tally(input.cards, (r) => r.day);
  const connects = tally(input.connects, (r) => r.day);
  const dates = tally(input.dates, (r) => r.day);
  const closures = tally(input.closures, (r) => r.day);
  const grads = tally(input.graduations, (r) => r.day);
  const activity = tally(input.activity, (r) => r.day);

  return days.map((day) => {
    const dayCards = cards.get(day) ?? [];
    const dayConnects = connects.get(day) ?? [];
    const dayDates = dates.get(day) ?? [];
    const dayClosures = closures.get(day) ?? [];

    const cardsShown = dayCards.length;
    const connectsSent = dayCards.filter((c) => c.action === "connected").length;

    /*
     * The accept rate divides by connects that got an *answer*, not by every
     * connect sent. A note sent last night and not yet replied to is not a
     * rejection, and counting it as one would make every recent day look worse
     * than it was — the number would drift upward for a week after the fact.
     */
    const answered = dayConnects.filter((c) => c.status !== "pending").length;
    const accepted = dayConnects.filter((c) => c.status === "accepted").length;

    return {
      day,
      dropsServed: (drops.get(day) ?? []).length,
      cardsShown,
      connectsSent,
      connectRate: rate(connectsSent, cardsShown),
      connectsAccepted: accepted,
      acceptRate: rate(accepted, answered),
      chatsOpen: openOn(input.chats, day),
      datesProposed: dayDates.filter((d) => d.status === "proposed").length,
      datesConfirmed: dayDates.filter((d) => d.status === "confirmed").length,
      datesCompleted: dayDates.filter((d) => d.status === "completed").length,
      /*
       * Split by who ended it, which is the ratio §7.3 asks for and the one
       * that says whether the product is working: a fuse close is the mechanic
       * doing its job when two people stalled, a user close is somebody
       * choosing to end it kindly. Neither is failure; the balance is the
       * signal.
       */
      closedByFuse: dayClosures.filter((c) => c.templateId === "fuse_auto").length,
      closedByUser: dayClosures.filter((c) => !c.systemSent).length,
      graduations: (grads.get(day) ?? []).filter((g) => g.status === "confirmed").length,
      activeMembers: new Set((activity.get(day) ?? []).map((a) => a.userId)).size,
    };
  });
}

/** Chats open at the end of a given day. */
function openOn(chats: MetricsInput["chats"], day: string): number {
  return chats.filter((c) => c.openedDay <= day && (c.closedDay === null || c.closedDay > day))
    .length;
}

/**
 * How many conversations a member juggles at once — §7.3's p50/p90/max, and
 * §11's S+14 checkpoint reads it to decide whether the drop needs tuning.
 *
 * Measured per member per day and then taken across the whole window, because
 * the question is "how loaded does one person get", not "how many chats
 * existed".
 */
export function concurrency(
  perMemberPerDay: { day: string; userId: string; open: number }[],
): Concurrency {
  const values = perMemberPerDay.map((r) => r.open).sort((a, b) => a - b);
  if (values.length === 0) return { p50: 0, p90: 0, max: 0 };

  // Nearest-rank, so p90 of ten samples is the ninth rather than an
  // interpolation between the ninth and tenth that nobody actually experienced.
  const at = (p: number) => values[Math.min(values.length - 1, Math.ceil(p * values.length) - 1)] ?? 0;
  return { p50: at(0.5), p90: at(0.9), max: values[values.length - 1] ?? 0 };
}

/** §7.3's CSV export. One row per day, header included. */
export function metricsToCsv(rows: DayMetrics[]): string {
  const columns: (keyof DayMetrics)[] = [
    "day", "dropsServed", "cardsShown", "connectsSent", "connectRate",
    "connectsAccepted", "acceptRate", "chatsOpen", "datesProposed",
    "datesConfirmed", "datesCompleted", "closedByFuse", "closedByUser",
    "graduations", "activeMembers",
  ];

  const cell = (value: DayMetrics[keyof DayMetrics]): string => {
    // An empty cell, not a zero: a rate below the floor was not measured, and
    // a spreadsheet that reads it as 0 would average it into the next chart.
    if (value === null) return "";
    return typeof value === "number" ? String(Math.round(value * 10_000) / 10_000) : String(value);
  };

  return [columns.join(","), ...rows.map((row) => columns.map((c) => cell(row[c])).join(","))].join(
    "\n",
  );
}
