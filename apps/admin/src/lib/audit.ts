import type { AdminAuditEntry } from "@noghost/types";
import { supabaseServer } from "./supabase";

/**
 * Reading the audit trail — spec §7.3.
 *
 * §7.3 requires every mutation to land in `admin_audit`, and migration 0009
 * exists so those rows can name the reviewer. Until this module there was
 * nothing that read them back, which makes the requirement decorative: a trail
 * nobody can read does not hold anyone accountable, it just accumulates.
 *
 * The table is append-only by construction — no insert, update or delete
 * policy exists for any client — so this file is reads only, and there is
 * deliberately no way to amend or annotate an entry from the console.
 */

/**
 * The uuid `audit()` substitutes when there is no `auth.uid()`, i.e. a cron
 * job running as the service role. `coalesce((select auth.uid()), '000…'::uuid)`
 * in 0007_rpcs.sql.
 */
export const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

export const AUDIT_PAGE_SIZE = 50;

/**
 * Who acted.
 *
 * The column is called `admin_id`, but `audit()` records whoever called the
 * function, and two of its three current callers are member-facing:
 * `close_chat` and `graduate` are invoked by members. So resolving against
 * `profiles` as well as `admin_users` is not defensive padding — it is the
 * only way a Phase 4 chat closure shows a name instead of a bare uuid.
 */
export interface AuditActor {
  id: string;
  label: string;
  kind: "system" | "admin" | "member" | "unknown";
  /** An admin whose access was revoked. Their history stays; the row does not. */
  revoked: boolean;
}

export interface AuditRow {
  id: string;
  action: string;
  createdAt: string;
  actor: AuditActor;
  targetTable: string | null;
  targetId: string | null;
  /**
   * Whether the target row was found — checked only for the tables this console
   * can actually open, so it is `false` for a `chats` entry too. The cell
   * distinguishes the two cases; see the Record column.
   *
   * The trail outlives its targets by design: it is append-only, and an
   * application can be deleted (a member exercising deletion, or
   * `db:verify:writes` cleaning up after itself) while the record of what was
   * done to it must remain. An entry can be perfectly valid and still have
   * nothing to open.
   */
  targetExists: boolean;
  detail: Record<string, unknown>;
}

export interface AuditPage {
  rows: AuditRow[];
  /** Opaque token for the next page, or null when this is the last one. */
  nextCursor: string | null;
  /** Entries matching the current filter, ignoring pagination. */
  total: number;
}

export interface AuditFilter {
  /** An actor's uuid. `SYSTEM_ACTOR` selects the cron jobs. */
  actor?: string;
  /** Restrict to one target row — the "history of this application" view. */
  target?: string;
  /** Cursor from a previous page. */
  before?: string;
}

/*
 * Both are validated before use, and that is not cosmetic. The cursor's two
 * halves are interpolated into a raw PostgREST `or=` expression below, where
 * unchecked input could inject filter syntax and widen the query. Anything
 * that fails these patterns is discarded rather than repaired.
 */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pagination is keyset on `(created_at, id)`, not on `created_at` alone.
 *
 * `audit()` stamps rows with `now()`, which is transaction start time — so any
 * function that audits more than one row in a single transaction produces
 * several entries sharing a timestamp to the microsecond. A cursor on
 * `created_at` alone then either skips the rest of that group or repeats it,
 * silently, and an audit trail that drops entries under load is worse than no
 * audit trail because it still looks complete.
 *
 * Today's callers each run in their own transaction so no collision exists yet;
 * this costs one extra `or` clause and stops the failure being possible.
 */
export function encodeCursor(row: { createdAt: string; id: string }): string {
  return Buffer.from(`${row.createdAt}|${row.id}`, "utf8").toString("base64url");
}

function decodeCursor(raw: string | undefined): { createdAt: string; id: string } | null {
  if (!raw) return null;
  const [createdAt, id, ...rest] = Buffer.from(raw, "base64url").toString("utf8").split("|");
  if (!createdAt || !id || rest.length > 0) return null;
  if (!ISO.test(createdAt) || !UUID.test(id)) return null;
  return { createdAt, id };
}

const COLUMNS = "id,admin_id,action,target_table,target_id,detail,created_at";

export async function listAudit(filter: AuditFilter = {}): Promise<AuditPage> {
  const supabase = await supabaseServer();

  const cursor = decodeCursor(filter.before);
  const actor = filter.actor && UUID.test(filter.actor) ? filter.actor : undefined;
  const target = filter.target && UUID.test(filter.target) ? filter.target : undefined;

  let query = supabase
    .from("admin_audit")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    // One more than a page, so "is there another page?" is answered by the
    // rows themselves rather than by a second count query against a moving
    // table.
    .limit(AUDIT_PAGE_SIZE + 1);

  if (actor) query = query.eq("admin_id", actor);
  if (target) query = query.eq("target_id", target);
  if (cursor) {
    query = query.or(
      `created_at.lt."${cursor.createdAt}",` +
        `and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`,
    );
  }

  /*
   * An exact count, deliberately. At this product's scale — one city, one
   * eight-week season — the trail is tens of thousands of rows and this is a
   * few milliseconds. If it ever becomes the slow part of the page, the fix is
   * to keep `exact` for the `target` filter (bounded, and served by
   * `admin_audit_target_idx`) and drop the total for the unfiltered view, not
   * to show an estimate: "roughly how many decisions were made" is not a
   * sentence an audit trail should be able to say.
   */
  let countQuery = supabase.from("admin_audit").select("id", { head: true, count: "exact" });
  if (actor) countQuery = countQuery.eq("admin_id", actor);
  if (target) countQuery = countQuery.eq("target_id", target);

  const [{ data, error }, { count }] = await Promise.all([query, countQuery]);

  /*
   * Thrown, not swallowed into an empty list. "The trail is empty" and "the
   * trail could not be read" must never render the same way — the first is a
   * fact about the season, the second is a broken guarantee.
   */
  if (error) throw new Error(`Audit trail: ${error.message}`);

  const entries = (data ?? []) as AdminAuditEntry[];
  const hasMore = entries.length > AUDIT_PAGE_SIZE;
  const page = hasMore ? entries.slice(0, AUDIT_PAGE_SIZE) : entries;

  const [actors, liveTargets] = await Promise.all([
    resolveActors(page.map((entry) => entry.admin_id)),
    liveApplications(page),
  ]);

  const rows = page.map((entry): AuditRow => {
    return {
      id: entry.id,
      action: entry.action,
      createdAt: entry.created_at,
      actor: actors.get(entry.admin_id) ?? unknownActor(entry.admin_id),
      targetTable: entry.target_table,
      targetId: entry.target_id,
      targetExists: Boolean(entry.target_id && liveTargets.has(entry.target_id)),
      detail:
        entry.detail && typeof entry.detail === "object" && !Array.isArray(entry.detail)
          ? entry.detail
          : {},
    };
  });

  const last = page[page.length - 1];

  return {
    rows,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null,
    total: count ?? rows.length,
  };
}

/**
 * Which `applications` targets on this page can still be opened.
 *
 * One bounded `.in()` over at most a page of ids — the same shape as the actor
 * lookup. Without it the trail offers links that 404, which on a page whose
 * only job is to be trustworthy reads as "the trail is wrong" rather than "that
 * record is gone".
 */
async function liveApplications(entries: AdminAuditEntry[]): Promise<Set<string>> {
  const ids = [
    ...new Set(
      entries
        .filter((entry) => entry.target_table === "applications" && entry.target_id)
        .map((entry) => entry.target_id as string),
    ),
  ];
  if (ids.length === 0) return new Set();

  const supabase = await supabaseServer();
  const { data } = await supabase.from("applications").select("id").in("id", ids);
  return new Set((data ?? []).map((row) => row.id));
}

function unknownActor(id: string): AuditActor {
  return { id, label: `${id.slice(0, 8)}…`, kind: "unknown", revoked: false };
}

/**
 * Turn actor uuids into names, in two bounded queries.
 *
 * Not a PostgREST embed: `admin_audit.admin_id` has no foreign key (the actor
 * may be a member, an admin, or the zero uuid, so no single reference is
 * correct), and the hand-written `Database` type declares `Relationships: []`
 * anyway — see the note in lib/admissions.ts.
 */
async function resolveActors(ids: string[]): Promise<Map<string, AuditActor>> {
  const resolved = new Map<string, AuditActor>();

  const real = [...new Set(ids)].filter((id) => id !== SYSTEM_ACTOR && UUID.test(id));

  resolved.set(SYSTEM_ACTOR, {
    id: SYSTEM_ACTOR,
    label: "System",
    kind: "system",
    revoked: false,
  });

  if (real.length === 0) return resolved;

  const supabase = await supabaseServer();
  const [{ data: admins }, { data: profiles }] = await Promise.all([
    supabase.from("admin_users").select("id,email,active").in("id", real),
    supabase.from("profiles").select("id,first_name").in("id", real),
  ]);

  for (const admin of admins ?? []) {
    resolved.set(admin.id, {
      id: admin.id,
      label: admin.email,
      kind: "admin",
      revoked: !admin.active,
    });
  }

  // Only where no admin row claimed the id. An admin who is also a member
  // should read as the admin — that is the capacity they acted in.
  for (const profile of profiles ?? []) {
    if (resolved.has(profile.id)) continue;
    resolved.set(profile.id, {
      id: profile.id,
      label: profile.first_name,
      kind: "member",
      revoked: false,
    });
  }

  return resolved;
}

/**
 * The actor filter's options.
 *
 * Built from `admin_users`, not from the trail. Deriving the list by scanning
 * `admin_audit` would need a DISTINCT that PostgREST cannot express, leaving
 * only a capped scan — and a filter bar assembled from the most recent N rows
 * quietly loses the reviewer who stopped working here last month.
 */
export async function auditActorOptions(): Promise<AuditActor[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("admin_users")
    .select("id,email,active")
    .order("email", { ascending: true })
    .limit(100);

  return [
    { id: SYSTEM_ACTOR, label: "System", kind: "system", revoked: false },
    ...(data ?? []).map(
      (admin): AuditActor => ({
        id: admin.id,
        label: admin.email,
        kind: "admin",
        revoked: !admin.active,
      }),
    ),
  ];
}

/** Human labels for the actions `audit()` is called with today. */
const ACTION_LABELS: Record<string, string> = {
  close_chat: "Chat closed",
  graduate: "Graduated off the app",
};

/**
 * What happened, in words.
 *
 * `advance_application` is one function covering two very different events, so
 * one label for it would be wrong most of the time. The applicant walking their
 * own funnel — `applied → phone_verified → selfie_submitted → under_review` —
 * goes through the same RPC as a reviewer's decision, and calling those rows
 * "Admissions decision" attributes a judgement to a form submission. On a page
 * whose whole purpose is accountability, most rows being mislabelled is how a
 * trail stops being trusted.
 *
 * The `to` status already distinguishes them, so nothing new needs recording.
 */
export function actionLabel(action: string, detail: Record<string, unknown> = {}): string {
  if (action === "advance_application") {
    switch (detail.to) {
      case "admitted":
      case "waitlisted":
      case "rejected":
        return "Admissions decision";
      case "claimed":
        return "Seat claimed";
      case "expired":
        return "Claim window expired";
      default:
        return "Application progressed";
    }
  }
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

/**
 * Where a target row can be opened, if anywhere.
 *
 * `chats` has no console view until Phase 4, so those entries show an id and
 * no link rather than a link that 404s.
 */
export function targetHref(row: AuditRow): `/admissions/${string}` | null {
  if (!row.targetId || !UUID.test(row.targetId) || !row.targetExists) return null;
  if (row.targetTable === "applications") return `/admissions/${row.targetId}`;
  return null;
}
