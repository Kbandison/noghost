import { NOTIFICATION_COPY, NOTIFICATION_MATRIX } from "@noghost/config/copy";
import { NOTIFICATION_TTL_HOURS } from "@noghost/logic";
import { supabaseServer } from "./supabase";

/**
 * What the Comms module needs to know — spec §7.3.
 *
 * The template list is assembled from the three places that each hold a
 * different half of the truth, rather than being typed out again here:
 *
 *   NOTIFICATION_MATRIX     §8 — which channels, and whether it can be declined
 *   NOTIFICATION_COPY       §9.4 — the actual push wording, where there is any
 *   NOTIFICATION_TTL_HOURS  how long it stays true, which decides whether a
 *                           late one is delivered or dropped
 *
 * Assembled rather than duplicated because the interesting rows are the ones
 * where those three disagree — a template in the matrix with no copy is one
 * nobody can receive, and the console should show that rather than hide it.
 */

export interface TemplateRow {
  key: string;
  channels: string[];
  optIn: string[];
  required: boolean;
  /** §9.4's push line, or null where the spec never wrote one. */
  push: string | null;
  sms: string | null;
  /** Hours before it is no longer true, or null for "always worth reading". */
  ttlHours: number | null;
  /** Placeholders the copy needs filled before it can be sent. */
  tokens: string[];
}

const TOKEN = /\{\{([A-Z_]+)\}\}/g;

const tokensIn = (...lines: (string | null)[]): string[] => {
  const found = new Set<string>();
  for (const line of lines) {
    for (const match of (line ?? "").matchAll(TOKEN)) found.add(match[1]!);
  }
  return [...found];
};

export function templateRows(): TemplateRow[] {
  const copy = NOTIFICATION_COPY as Record<string, { push?: string; sms?: string } | undefined>;

  return Object.entries(NOTIFICATION_MATRIX).map(([key, entry]) => {
    const push = copy[key]?.push ?? null;
    const sms = copy[key]?.sms ?? null;
    return {
      key,
      channels: [...entry.channels],
      optIn: "optIn" in entry ? [...(entry.optIn as readonly string[])] : [],
      required: entry.required,
      push,
      sms,
      ttlHours: key in NOTIFICATION_TTL_HOURS ? NOTIFICATION_TTL_HOURS[key]! : null,
      tokens: tokensIn(push, sms),
    };
  });
}

export interface SeasonChoice {
  id: string;
  name: string;
  phase: string;
  members: number;
}

/**
 * Seasons a broadcast could go to, with how many people are actually in each.
 *
 * The count is the point. "Broadcast to Atlanta Season One" says nothing about
 * whether that is three people or three hundred, and the difference is whether
 * the button is a test or a decision.
 */
export async function broadcastTargets(): Promise<SeasonChoice[]> {
  const supabase = await supabaseServer();

  const { data: seasons, error } = await supabase
    .from("seasons")
    .select("id,name,phase")
    .order("starts_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error(`[admin] broadcast targets: ${error.message}`);
    return [];
  }

  const ids = (seasons ?? []).map((season) => season.id);
  if (ids.length === 0) return [];

  const { data: members } = await supabase
    .from("season_members")
    .select("season_id")
    .in("season_id", ids)
    .limit(10000);

  const counts = new Map<string, number>();
  for (const row of members ?? []) {
    counts.set(row.season_id, (counts.get(row.season_id) ?? 0) + 1);
  }

  return (seasons ?? []).map((season) => ({
    id: season.id,
    name: season.name,
    phase: season.phase,
    members: counts.get(season.id) ?? 0,
  }));
}

export interface SentBroadcast {
  id: string;
  body: string;
  email: boolean;
  rows: number;
  seasonId: string | null;
  at: string;
}

/**
 * Broadcasts already sent, read back out of the audit trail.
 *
 * There is no `broadcasts` table and there should not be: the audit row already
 * records who said what to which season and when, and a second copy of the same
 * fact is a second thing that can disagree with the first. §7.3 requires the
 * audit row regardless.
 */
export async function recentBroadcasts(limit = 10): Promise<SentBroadcast[]> {
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("admin_audit")
    .select("id,target_id,detail,created_at")
    .eq("action", "broadcast")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`[admin] recent broadcasts: ${error.message}`);
    return [];
  }

  return (data ?? []).map((row) => {
    const detail = (row.detail ?? {}) as { body?: string; email?: boolean; rows?: number };
    return {
      id: row.id,
      body: detail.body ?? "",
      email: Boolean(detail.email),
      rows: detail.rows ?? 0,
      seasonId: row.target_id,
      at: row.created_at,
    };
  });
}
