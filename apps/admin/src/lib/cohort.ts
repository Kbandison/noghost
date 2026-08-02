import { GENDERS } from "@noghost/config";
import type { Gender } from "@noghost/types";
import { supabaseServer } from "./supabase";

/**
 * The ratio dashboard — spec §7.3, "seats claimed vs cap per matching segment
 * (gender × seeking), imbalance warnings".
 *
 * Raw headcount is the wrong number to look at. A cohort of 300 that is 200
 * men seeking women and 40 women seeking men is not 300 people who can be
 * matched — it is 40 pairs and 160 people who will get quiet nights for eight
 * weeks. Because §6.1's drop filter is mutual, what matters is always the
 * *smaller* side of each directed pair.
 *
 * So this reports, for every direction A→B, how many people want B and how
 * many people B-side want A back. The ratio between them is the imbalance.
 */

export interface Segment {
  from: Gender;
  to: Gender;
  /** People of gender `from` whose `seeking` includes `to`. */
  supply: number;
  /** People of gender `to` whose `seeking` includes `from` — the reciprocal. */
  reciprocal: number;
  /** supply / reciprocal. Above 1 means more demand than there is to meet it. */
  ratio: number;
  severity: "ok" | "watch" | "bad";
}

export interface CohortHealth {
  members: number;
  cap: number;
  segments: Segment[];
  /** Directions with nobody at all on the other side. */
  dead: Segment[];
}

/** Beyond this, one side is meaningfully starved of people to be shown. */
const WATCH = 1.5;
const BAD = 2.5;

export async function cohortHealth(seasonId: string, cap: number): Promise<CohortHealth> {
  const supabase = await supabaseServer();

  // The cohort is who is actually in — admitted or claimed. Applications still
  // under review are not yet a commitment either way.
  const { data: applications } = await supabase
    .from("applications")
    .select("user_id,status")
    .eq("season_id", seasonId)
    .in("status", ["admitted", "claimed"])
    .limit(2000);

  const userIds = (applications ?? []).map((a) => a.user_id);
  if (userIds.length === 0) {
    return { members: 0, cap, segments: [], dead: [] };
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,gender,seeking")
    .in("id", userIds);

  const people = (profiles ?? []) as { id: string; gender: Gender; seeking: Gender[] }[];

  /** How many people of gender `from` are open to `to`. */
  const count = (from: Gender, to: Gender) =>
    people.filter((p) => p.gender === from && p.seeking.includes(to)).length;

  const segments: Segment[] = [];
  for (const from of GENDERS) {
    for (const to of GENDERS) {
      const supply = count(from, to);
      if (supply === 0) continue; // nobody in this direction; nothing to warn about

      const reciprocal = count(to, from);
      // No reciprocal at all is infinite imbalance; represent it as such rather
      // than dividing by zero and rendering NaN in the console.
      const ratio = reciprocal === 0 ? Infinity : supply / reciprocal;

      segments.push({
        from,
        to,
        supply,
        reciprocal,
        ratio,
        severity: ratio >= BAD ? "bad" : ratio >= WATCH ? "watch" : "ok",
      });
    }
  }

  segments.sort((a, b) => b.ratio - a.ratio);

  return {
    members: people.length,
    cap,
    segments,
    dead: segments.filter((s) => s.reciprocal === 0),
  };
}

export interface ClaimWindow {
  applicationId: string;
  firstName: string;
  deadline: string;
  hoursLeft: number;
}

/**
 * Admitted applicants who haven't paid yet, most urgent first.
 *
 * A seat sitting in an unclaimed window is a seat nobody else can have, so
 * this is the number that decides when to promote from the waitlist.
 */
export async function claimWindows(seasonId: string, now: string): Promise<ClaimWindow[]> {
  const supabase = await supabaseServer();

  const { data: applications } = await supabase
    .from("applications")
    .select("id,user_id,claim_deadline")
    .eq("season_id", seasonId)
    .eq("status", "admitted")
    .order("claim_deadline", { ascending: true })
    .limit(200);

  const rows = (applications ?? []).filter((a) => a.claim_deadline);
  if (rows.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,first_name")
    .in("id", rows.map((a) => a.user_id));

  const names = new Map((profiles ?? []).map((p) => [p.id, p.first_name]));
  const nowMs = Date.parse(now);

  return rows.map((a) => ({
    applicationId: a.id,
    firstName: names.get(a.user_id) ?? "Unknown",
    deadline: a.claim_deadline!,
    hoursLeft: Math.round((Date.parse(a.claim_deadline!) - nowMs) / 3_600_000),
  }));
}
