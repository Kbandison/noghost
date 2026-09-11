import type { createServiceClient } from "@noghost/db/service";
import { seasonWeek } from "@noghost/logic";
import type { BuildDropInput, DropSeasonConfig, PassRecord, PoolProfile } from "@noghost/logic";
import type { Gender, MemberStatus } from "@noghost/types";

/**
 * Everything `buildDrop` needs for a whole season, loaded once.
 *
 * `buildDrop` is pure and takes one viewer's world as an argument: their pool,
 * what they have already been shown, who they passed on and when, who they
 * already have a connect with, and who is blocked. Fetching that per member
 * would be five round trips times three hundred people, every night.
 *
 * So the season is loaded in a handful of bulk reads and indexed in memory.
 * The whole set is small — a few hundred profiles, tens of thousands of cards
 * over eight weeks — and the work is a couple of seconds against a 300-second
 * function timeout.
 */

/**
 * Derived from the factory rather than importing `SupabaseClient` directly —
 * `apps/web` does not depend on supabase-js, and adding the dependency just to
 * name a type would put a second copy of the client in the tree.
 */
type Db = ReturnType<typeof createServiceClient>;

/** PostgREST caps a response at 1000 rows; `drop_cards` outgrows that in week one. */
const PAGE = 1000;

/**
 * Reads an entire table's worth of matching rows, a page at a time.
 *
 * Ordered by `id` rather than by the column being filtered on. Range
 * pagination over an unstable order silently skips and repeats rows, and a
 * drop built from a partial history would re-serve someone the member has
 * already seen — the one thing rule 2 exists to prevent.
 */
async function fetchAll<T>(
  label: string,
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; ; page += 1) {
    const { data, error } = await query(page * PAGE, (page + 1) * PAGE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    // A season cannot legitimately produce this much; bail rather than loop.
    if (page > 500) throw new Error(`${label}: refused to page past ${rows.length} rows`);
  }
  return rows;
}

export interface SeasonPool {
  /** Every active member, in the shape the algorithm wants. */
  pool: PoolProfile[];
  /** Assembles one member's `buildDrop` input from the shared indexes. */
  inputFor(viewer: PoolProfile, dropDate: string, now: string): BuildDropInput;
}

interface SeasonRow {
  id: string;
  starts_at: string;
  drop_max: number;
  encore_start_week: number;
}

/** Connects count toward the activity-balance nudge for a rolling seven days. */
const ACTIVITY_WINDOW_DAYS = 7;

/** Drop ids per `.in()` filter — 100 uuids is roughly 3.7 KB of query string. */
const DROP_ID_CHUNK = 100;

export async function loadSeasonPool(
  db: Db,
  season: SeasonRow,
  now: string,
): Promise<SeasonPool> {
  const config: DropSeasonConfig = {
    startsAt: season.starts_at,
    dropMax: season.drop_max,
    encoreStartWeek: season.encore_start_week,
  };

  /*
   * Membership is `season_members`, not `applications.status = 'claimed'`.
   * The two agree today, but the membership row is the one written by the
   * Stripe webhook and the one every other mechanic keys off; an application
   * is the record of how someone got here, not of whether they are here.
   */
  const members = await fetchAll<{ user_id: string }>("season members", (from, to) =>
    db.from("season_members").select("user_id").eq("season_id", season.id).range(from, to),
  );
  const memberIds = new Set(members.map((row) => row.user_id));

  const profiles = await fetchAll<{
    id: string;
    gender: Gender;
    seeking: Gender[];
    birthdate: string;
    age_min: number;
    age_max: number;
    neighborhood: string | null;
    lat: number | null;
    lng: number | null;
    travel_radius_km: number | null;
    interests: string[] | null;
    status: MemberStatus;
  }>("profiles", (from, to) =>
    db
      .from("profiles")
      .select(
        "id,gender,seeking,birthdate,age_min,age_max,neighborhood,lat,lng,travel_radius_km,interests,status",
      )
      .order("id", { ascending: true })
      .range(from, to),
  );

  const connects = await fetchAll<{
    from_user: string;
    to_user: string;
    created_at: string;
  }>("connects", (from, to) =>
    db
      .from("connects")
      .select("from_user,to_user,created_at")
      .eq("season_id", season.id)
      .order("id", { ascending: true })
      .range(from, to),
  );

  /*
   * Reports are not scoped to a season — a report is about a person, and its
   * effect ("these two never see each other again") should outlive the season
   * it was filed in.
   */
  const reports = await fetchAll<{ reporter_id: string; reported_id: string }>(
    "reports",
    (from, to) =>
      db
        .from("reports")
        .select("reporter_id,reported_id")
        .order("id", { ascending: true })
        .range(from, to),
  );

  const drops = await fetchAll<{ id: string; user_id: string }>("drops", (from, to) =>
    db
      .from("drops")
      .select("id,user_id")
      .eq("season_id", season.id)
      .order("id", { ascending: true })
      .range(from, to),
  );
  const dropOwner = new Map(drops.map((row) => [row.id, row.user_id]));

  /*
   * Chunked, because the filter travels in the URL.
   *
   * A full cohort over an eight-week season is 300 × 56 ≈ 16,800 drops, and
   * one `.in()` listing every id is about 600 KB of query string — far past
   * what PostgREST or any proxy in front of it will accept. It works fine on a
   * fixture of forty and fails outright in week two of a real season, which is
   * the worst possible time to find out.
   */
  const dropIds = [...dropOwner.keys()];
  const cards: {
    drop_id: string;
    shown_profile_id: string;
    action: string;
    acted_at: string | null;
  }[] = [];

  for (let i = 0; i < dropIds.length; i += DROP_ID_CHUNK) {
    const chunk = dropIds.slice(i, i + DROP_ID_CHUNK);
    cards.push(
      ...(await fetchAll<(typeof cards)[number]>("drop cards", (from, to) =>
        db
          .from("drop_cards")
          .select("drop_id,shown_profile_id,action,acted_at")
          .in("drop_id", chunk)
          .order("id", { ascending: true })
          .range(from, to),
      )),
    );
  }

  // ---- indexes ------------------------------------------------------------

  const windowStart = Date.parse(now) - ACTIVITY_WINDOW_DAYS * 86_400_000;
  const incoming = new Map<string, number>();
  const partners = new Map<string, Set<string>>();

  const link = (map: Map<string, Set<string>>, a: string, b: string) => {
    let set = map.get(a);
    if (!set) map.set(a, (set = new Set()));
    set.add(b);
  };

  for (const connect of connects) {
    if (Date.parse(connect.created_at) >= windowStart) {
      incoming.set(connect.to_user, (incoming.get(connect.to_user) ?? 0) + 1);
    }
    // Rule 3 is symmetric: one shot per pair, whichever direction it went.
    link(partners, connect.from_user, connect.to_user);
    link(partners, connect.to_user, connect.from_user);
  }

  const blocked = new Map<string, Set<string>>();
  for (const report of reports) {
    link(blocked, report.reporter_id, report.reported_id);
    link(blocked, report.reported_id, report.reporter_id);
  }

  const seen = new Map<string, Set<string>>();
  const passed = new Map<string, PassRecord[]>();
  for (const card of cards) {
    const viewer = dropOwner.get(card.drop_id);
    if (!viewer) continue;
    link(seen, viewer, card.shown_profile_id);
    if (card.action === "passed") {
      const list = passed.get(viewer) ?? [];
      list.push({
        profileId: card.shown_profile_id,
        // `acted_at` is when they passed. Falling back to `now` would put an
        // old pass in the current week and quietly disqualify it from the
        // encore window, which only looks at weeks one and two.
        week: seasonWeek(season.starts_at, card.acted_at ?? now),
      });
      passed.set(viewer, list);
    }
  }

  const pool: PoolProfile[] = profiles
    .filter((profile) => memberIds.has(profile.id))
    .map((profile) => ({
      id: profile.id,
      gender: profile.gender,
      seeking: profile.seeking ?? [],
      birthdate: profile.birthdate,
      ageMin: profile.age_min,
      ageMax: profile.age_max,
      neighborhood: profile.neighborhood,
      /*
       * Null unless both halves are present — 0028's `profiles_point_whole`
       * constraint guarantees that at the database, and the scorer treats a
       * missing point as "cannot judge" rather than as far away.
       */
      point:
        profile.lat !== null && profile.lng !== null
          ? { lat: Number(profile.lat), lng: Number(profile.lng) }
          : null,
      travelRadiusKm: profile.travel_radius_km,
      interests: profile.interests ?? [],
      status: profile.status,
      incomingConnectsThisWeek: incoming.get(profile.id) ?? 0,
    }));

  const EMPTY: string[] = [];

  return {
    pool,
    inputFor(viewer, dropDate, at) {
      return {
        season: config,
        dropDate,
        now: at,
        viewer,
        pool,
        seenProfileIds: [...(seen.get(viewer.id) ?? EMPTY)],
        passedHistory: passed.get(viewer.id) ?? [],
        connectedProfileIds: [...(partners.get(viewer.id) ?? EMPTY)],
        blockedProfileIds: [...(blocked.get(viewer.id) ?? EMPTY)],
      };
    },
  };
}
