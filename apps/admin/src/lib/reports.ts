import type { MemberStatus } from "@noghost/types";
import { supabaseServer } from "./supabase";

/**
 * Reads for the moderation queue — spec §7.3.
 *
 * Same shape as the admissions reads and for the same reasons: the admin's own
 * session, so `admins manage reports` and `admins read all profiles` are what
 * grant access, and related rows come back as bounded `.in()` queries rather
 * than PostgREST embeds, which the hand-written `Database` type cannot express.
 *
 * One thing is deliberately not read here: `has_report_between()` hides the two
 * people from *each other*, never from an admin. A moderator who could not see
 * both sides could not moderate, which is why the reports policy is `for all`
 * and why the profile lookups below are unfiltered.
 */

export type Resolution = "dismissed" | "warned" | "removed";

export interface ReportPerson {
  id: string;
  firstName: string;
  status: MemberStatus;
}

export interface ReportRow {
  id: string;
  reason: string;
  detail: string | null;
  createdAt: string;
  resolution: Resolution | null;
  resolvedAt: string | null;
  chatId: string | null;
  reporter: ReportPerson;
  reported: ReportPerson;
  /** How many reports this person has against them, resolved or not. */
  reportsAgainst: number;
}

/** One message of the reported conversation, for the context view (§7.3). */
export interface ContextMessage {
  id: string;
  kind: "text" | "voice" | "system";
  body: string | null;
  createdAt: string;
  /** Which side said it — by role, because names are already on the page. */
  from: "reporter" | "reported" | "system";
}

interface Row {
  id: string;
  reporter_id: string;
  reported_id: string;
  chat_id: string | null;
  reason: string;
  detail: string | null;
  resolution: Resolution | null;
  resolved_at: string | null;
  created_at: string;
}

const UNKNOWN = (id: string): ReportPerson => ({
  id,
  // A deleted account leaves its reports behind — `reports.reporter_id`
  // cascades, but a report about somebody removed in a previous season can
  // outlive the profile row. Better a placeholder than a crash on a queue.
  firstName: "Unknown",
  status: "removed",
});

async function decorate(rows: Row[]): Promise<ReportRow[]> {
  if (rows.length === 0) return [];
  const supabase = await supabaseServer();

  const ids = [...new Set(rows.flatMap((row) => [row.reporter_id, row.reported_id]))];
  const { data: people } = await supabase
    .from("profiles")
    .select("id,first_name,status")
    .in("id", ids);
  const byId = new Map(
    (people ?? []).map((person) => [
      person.id,
      { id: person.id, firstName: person.first_name, status: person.status },
    ]),
  );

  /*
   * A count of prior reports per reported member, which is the single most
   * useful number on this screen: one report is an incident, four is a pattern,
   * and the queue should not make somebody notice that by remembering names.
   *
   * Counted across the whole table rather than only the rows on this page.
   */
  const reportedIds = [...new Set(rows.map((row) => row.reported_id))];
  const { data: all } = await supabase
    .from("reports")
    .select("reported_id")
    .in("reported_id", reportedIds);
  const against = new Map<string, number>();
  for (const row of all ?? []) {
    against.set(row.reported_id, (against.get(row.reported_id) ?? 0) + 1);
  }

  return rows.map((row) => ({
    id: row.id,
    reason: row.reason,
    detail: row.detail,
    createdAt: row.created_at,
    resolution: row.resolution,
    resolvedAt: row.resolved_at,
    chatId: row.chat_id,
    reporter: byId.get(row.reporter_id) ?? UNKNOWN(row.reporter_id),
    reported: byId.get(row.reported_id) ?? UNKNOWN(row.reported_id),
    reportsAgainst: against.get(row.reported_id) ?? 0,
  }));
}

/**
 * The queue. Open reports first and oldest-first within that, because the
 * thing that has been waiting longest is the thing somebody is still waiting
 * on — the opposite of the newest-first ordering every other list uses.
 */
export async function listReports(includeResolved = false): Promise<ReportRow[]> {
  const supabase = await supabaseServer();
  let query = supabase
    .from("reports")
    .select("id,reporter_id,reported_id,chat_id,reason,detail,resolution,resolved_at,created_at")
    .order("created_at", { ascending: true })
    .limit(200);

  if (!includeResolved) query = query.is("resolution", null);

  const { data, error } = await query;
  if (error) {
    console.error(`[reports] list: ${error.message}`);
    return [];
  }
  return decorate((data ?? []) as Row[]);
}

export async function getReport(id: string): Promise<ReportRow | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("reports")
    .select("id,reporter_id,reported_id,chat_id,reason,detail,resolution,resolved_at,created_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const [row] = await decorate([data as Row]);
  return row ?? null;
}

/**
 * The reported conversation — §7.3's "chat context view".
 *
 * Read only when a report names a chat, and only ever for that chat. This is
 * the most invasive thing the console can do: two members' private
 * conversation, opened because one of them asked for help. It is scoped to the
 * report, capped, and there is no way to browse from here to any other chat.
 */
export async function chatContext(report: ReportRow): Promise<ContextMessage[]> {
  if (!report.chatId) return [];
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("messages")
    .select("id,kind,body,sender_id,created_at")
    .eq("chat_id", report.chatId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(500);

  if (error) {
    console.error(`[reports] context ${report.chatId}: ${error.message}`);
    return [];
  }

  return (data ?? []).map((message) => ({
    id: message.id,
    kind: message.kind,
    body: message.body,
    createdAt: message.created_at,
    from:
      message.sender_id === null
        ? "system"
        : message.sender_id === report.reporter.id
          ? "reporter"
          : "reported",
  }));
}
