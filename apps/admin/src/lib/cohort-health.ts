import {
  concurrency,
  dailyMetrics,
  dayRange,
  type Concurrency,
  type DayMetrics,
  type MetricsInput,
} from "@noghost/logic";
import { supabaseServer } from "./supabase";

/**
 * Reading what cohort health needs — spec §7.3.
 *
 * The arithmetic lives in `packages/logic`; this is only the fetching, so the
 * numbers can be tested against fixtures rather than against a season that
 * changes under the test.
 *
 * Every read is scoped to one season and bounded by a date window, because the
 * alternative is a page that gets slower every night of a season and finally
 * times out in week eight, when it is most needed.
 */

export interface CohortReport {
  from: string;
  to: string;
  days: DayMetrics[];
  chatLoad: Concurrency;
  /** Members in the season, for turning DAU into a fraction. */
  cohortSize: number;
}

const dayOf = (iso: string | null, timeZone: string): string =>
  iso
    ? new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
        .format(new Date(iso))
    : "";

export async function cohortReport(
  seasonId: string,
  timeZone: string,
  from: string,
  to: string,
): Promise<CohortReport> {
  const supabase = await supabaseServer();
  const fromIso = `${from}T00:00:00Z`;
  // The window is inclusive, so the upper bound is the start of the next day.
  const toIso = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString();

  const [drops, chats, members] = await Promise.all([
    supabase
      .from("drops").select("id,user_id,drop_date,released_at")
      .eq("season_id", seasonId).not("released_at", "is", null)
      .gte("drop_date", from).lte("drop_date", to).limit(20000),
    supabase
      .from("chats").select("id,user_a,user_b,state,created_at,closed_at")
      .eq("season_id", seasonId).limit(20000),
    supabase
      .from("season_members").select("user_id").eq("season_id", seasonId).limit(5000),
  ]);

  const dropIds = (drops.data ?? []).map((d) => d.id);
  const dropDay = new Map((drops.data ?? []).map((d) => [d.id, d.drop_date as string]));
  const chatIds = (chats.data ?? []).map((c) => c.id);

  const [cards, connects, dates, closures, grads, messages] = await Promise.all([
    dropIds.length
      ? supabase.from("drop_cards").select("drop_id,action").in("drop_id", dropIds).limit(60000)
      : Promise.resolve({ data: [] as { drop_id: string; action: string }[] }),
    supabase
      .from("connects").select("from_user,status,created_at")
      .eq("season_id", seasonId).gte("created_at", fromIso).lt("created_at", toIso).limit(20000),
    chatIds.length
      ? supabase.from("dates").select("status,created_at").in("chat_id", chatIds)
          .gte("created_at", fromIso).lt("created_at", toIso).limit(20000)
      : Promise.resolve({ data: [] as { status: string; created_at: string }[] }),
    chatIds.length
      ? supabase.from("closure_notes").select("template_id,from_user,created_at").in("chat_id", chatIds)
          .gte("created_at", fromIso).lt("created_at", toIso).limit(20000)
      : Promise.resolve({ data: [] as { template_id: string; from_user: string | null; created_at: string }[] }),
    chatIds.length
      ? supabase.from("graduations").select("status,created_at").in("chat_id", chatIds)
          .gte("created_at", fromIso).lt("created_at", toIso).limit(5000)
      : Promise.resolve({ data: [] as { status: string; created_at: string }[] }),
    /*
     * DAU, defined as what the schema actually records.
     *
     * There is no events table and no session log, so "active" cannot mean
     * "opened the app". It means a member sent a message that day — the one
     * durable trace of somebody doing something. That undercounts a person who
     * read their drop and passed on all three, and the screen says so rather
     * than pretending the number is attendance.
     */
    chatIds.length
      ? supabase.from("messages").select("sender_id,created_at").in("chat_id", chatIds)
          .not("sender_id", "is", null)
          .gte("created_at", fromIso).lt("created_at", toIso).limit(60000)
      : Promise.resolve({ data: [] as { sender_id: string | null; created_at: string }[] }),
  ]);

  const input: MetricsInput = {
    drops: (drops.data ?? []).map((d) => ({ day: d.drop_date as string, userId: d.user_id as string })),
    cards: (cards.data ?? []).map((c) => ({
      day: dropDay.get(c.drop_id) ?? "",
      action: c.action as "pending" | "connected" | "passed",
    })),
    connects: (connects.data ?? []).map((c) => ({
      day: dayOf(c.created_at as string, timeZone),
      status: c.status as "pending" | "accepted" | "declined" | "expired",
      fromUser: c.from_user as string,
    })),
    chats: (chats.data ?? []).map((c) => ({
      openedDay: dayOf(c.created_at as string, timeZone),
      closedDay: c.closed_at ? dayOf(c.closed_at as string, timeZone) : null,
      state: c.state as string,
    })),
    dates: (dates.data ?? []).map((d) => ({
      day: dayOf(d.created_at as string, timeZone),
      status: d.status as "proposed" | "confirmed" | "cancelled" | "completed",
    })),
    closures: (closures.data ?? []).map((c) => ({
      day: dayOf(c.created_at as string, timeZone),
      templateId: c.template_id as string,
      // Null `from_user` is the system: the fuse, a removal, the season ending.
      systemSent: c.from_user === null,
    })),
    graduations: (grads.data ?? []).map((g) => ({
      day: dayOf(g.created_at as string, timeZone),
      status: g.status as "proposed" | "confirmed" | "declined",
    })),
    activity: (messages.data ?? [])
      .filter((m) => m.sender_id)
      .map((m) => ({ day: dayOf(m.created_at as string, timeZone), userId: m.sender_id as string })),
  };

  const days = dayRange(from, to);

  /*
   * Concurrency is per member per day, which is the question §7.3 is asking —
   * "how many chats does one person juggle", not "how many existed". Built here
   * rather than in the query because it needs both sides of every chat.
   */
  const perMemberPerDay: { day: string; userId: string; open: number }[] = [];
  for (const day of days) {
    const counts = new Map<string, number>();
    for (const chat of chats.data ?? []) {
      const opened = dayOf(chat.created_at as string, timeZone);
      const closed = chat.closed_at ? dayOf(chat.closed_at as string, timeZone) : null;
      if (opened > day || (closed !== null && closed <= day)) continue;
      for (const side of [chat.user_a as string, chat.user_b as string]) {
        counts.set(side, (counts.get(side) ?? 0) + 1);
      }
    }
    for (const [userId, open] of counts) perMemberPerDay.push({ day, userId, open });
  }

  return {
    from,
    to,
    days: dailyMetrics(input, days),
    chatLoad: concurrency(perMemberPerDay),
    cohortSize: (members.data ?? []).length,
  };
}
