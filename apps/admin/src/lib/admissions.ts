import { ageOn } from "@noghost/logic";
import type { ApplicationStatus, Gender } from "@noghost/types";
import { photoList, type ReviewPhoto } from "./photo-list";
import { supabaseServer } from "./supabase";

/**
 * Reads for the admissions module — spec §7.3.
 *
 * Everything here runs on the admin's own session, so `admins read all
 * profiles` and `admins manage applications` are what grant access. If those
 * policies were wrong, these queries would return nothing rather than quietly
 * over-sharing.
 *
 * Related rows are fetched as a second `.in()` query rather than a PostgREST
 * embed. The hand-written `Database` type declares `Relationships: []`, so an
 * embed compiles to `never` and the failure appears as an unrelated type error
 * far from its cause. Two bounded queries over a 300-member cohort is not the
 * thing worth optimising.
 */

export interface QueueRow {
  id: string;
  status: ApplicationStatus;
  createdAt: string;
  claimDeadline: string | null;
  userId: string;
  firstName: string;
  age: number;
  gender: Gender;
  neighborhood: string | null;
  photoPath: string | null;
  hasSelfie: boolean;
}

export interface ApplicationDetail extends QueueRow {
  seasonId: string;
  seeking: Gender[];
  ageMin: number;
  ageMax: number;
  interests: string[];
  occupation: string | null;
  heightCm: number | null;
  phone: string | null;
  birthdate: string;
  photoPaths: string[];
  /** With the approval flag, for the review grid. */
  photos: ReviewPhoto[];
  prompts: { prompt_id: string; answer: string }[];
  selfiePath: string | null;
  /** Every frame of the pose sequence, in order. 0029. */
  framePaths: string[];
  /** Did the live sequence get answered? Null means no check ran. */
  challengePassed: boolean | null;
  livenessScore: number | null;
  /**
   * The automated verdict. **Null is not a failure** — it means nothing ran.
   * The screen says so in words, because a reviewer who reads a null as a
   * failed check is reviewing a different case than the one in front of them.
   */
  livenessPassed: boolean | null;
  autoReason: string | null;
  autoCheckedAt: string | null;
  phoneVerifiedAt: string | null;
}

interface ProfileRow {
  id: string;
  first_name: string;
  birthdate: string;
  gender: Gender;
  seeking: Gender[];
  age_min: number;
  age_max: number;
  interests: string[];
  neighborhood: string | null;
  occupation: string | null;
  height_cm: number | null;
  phone: string | null;
  photos: unknown;
  prompts: unknown;
}

/** `photos` is jsonb; narrow it rather than trusting the column's shape. */
function photoPaths(photos: unknown): string[] {
  return photoList(photos).map((photo) => photo.path);
}

function promptList(prompts: unknown): { prompt_id: string; answer: string }[] {
  if (!Array.isArray(prompts)) return [];
  return prompts.flatMap((p) =>
    typeof p === "object" && p !== null && "prompt_id" in p && "answer" in p
      ? [{ prompt_id: String(p.prompt_id), answer: String(p.answer) }]
      : [],
  );
}

const PROFILE_COLUMNS =
  "id,first_name,birthdate,gender,seeking,age_min,age_max,interests,neighborhood,occupation,height_cm,phone,photos,prompts";

export async function listQueue(status: ApplicationStatus | "all" = "under_review") {
  const supabase = await supabaseServer();
  const now = new Date().toISOString();

  let query = supabase
    .from("applications")
    .select("id,user_id,season_id,status,created_at,claim_deadline")
    // Oldest first: the queue is a queue. Somebody who applied on day one
    // should not sit behind somebody who applied this morning.
    .order("created_at", { ascending: true })
    .limit(200);

  if (status !== "all") query = query.eq("status", status);

  const { data: applications, error } = await query;
  if (error) throw new Error(`Admissions queue: ${error.message}`);
  if (!applications || applications.length === 0) return [];

  const userIds = applications.map((a) => a.user_id);

  const [{ data: profiles }, { data: verifications }] = await Promise.all([
    supabase.from("profiles").select(PROFILE_COLUMNS).in("id", userIds),
    supabase.from("verifications").select("user_id,selfie_path").in("user_id", userIds),
  ]);

  const byId = new Map((profiles ?? []).map((p) => [p.id, p as ProfileRow]));
  const selfies = new Set(
    (verifications ?? []).filter((v) => v.selfie_path).map((v) => v.user_id),
  );

  return applications.flatMap((application): QueueRow[] => {
    const profile = byId.get(application.user_id);
    // An application whose profile row is missing is a data fault, not a
    // reviewable item. Dropping it keeps the queue honest; it will surface in
    // the count mismatch on the overview.
    if (!profile) return [];

    return [
      {
        id: application.id,
        status: application.status as ApplicationStatus,
        createdAt: application.created_at,
        claimDeadline: application.claim_deadline,
        userId: application.user_id,
        firstName: profile.first_name,
        age: ageOn(profile.birthdate, now),
        gender: profile.gender,
        neighborhood: profile.neighborhood,
        photoPath: photoPaths(profile.photos)[0] ?? null,
        hasSelfie: selfies.has(application.user_id),
      },
    ];
  });
}

export async function getApplication(id: string): Promise<ApplicationDetail | null> {
  const supabase = await supabaseServer();
  const now = new Date().toISOString();

  const { data: application } = await supabase
    .from("applications")
    .select("id,user_id,season_id,status,created_at,claim_deadline")
    .eq("id", id)
    .maybeSingle();

  if (!application) return null;

  const [{ data: profile }, { data: verificationRows }] = await Promise.all([
    supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", application.user_id).maybeSingle(),
    /*
     * Through `review_verification` rather than a table select. 0029 revokes
     * the score, the verdict and the reason from `authenticated` — the
     * applicant owns this row and RLS restricts rows, not columns, so a plain
     * select would have handed them their own match score. The RPC asks
     * `is_admin()` itself, so the database is still what decides.
     */
    supabase.rpc("review_verification", { p_user_id: application.user_id }),
  ]);

  if (!profile) return null;
  const p = profile as ProfileRow;
  // The RPC returns a set; one row or none.
  const review = verificationRows?.[0];

  return {
    id: application.id,
    seasonId: application.season_id,
    status: application.status as ApplicationStatus,
    createdAt: application.created_at,
    claimDeadline: application.claim_deadline,
    userId: application.user_id,
    firstName: p.first_name,
    birthdate: p.birthdate,
    age: ageOn(p.birthdate, now),
    gender: p.gender,
    seeking: p.seeking,
    ageMin: p.age_min,
    ageMax: p.age_max,
    interests: p.interests ?? [],
    neighborhood: p.neighborhood,
    occupation: p.occupation,
    heightCm: p.height_cm,
    phone: p.phone,
    photoPaths: photoPaths(p.photos),
    photos: photoList(p.photos),
    prompts: promptList(p.prompts),
    photoPath: photoPaths(p.photos)[0] ?? null,
    hasSelfie: Boolean(review?.selfie_path),
    selfiePath: review?.selfie_path ?? null,
    framePaths: review?.frame_paths ?? [],
    challengePassed: review?.challenge_passed ?? null,
    livenessScore: review?.liveness_score === null || review?.liveness_score === undefined
      ? null
      : Number(review.liveness_score),
    livenessPassed: review?.liveness_passed ?? null,
    autoReason: review?.auto_reason ?? null,
    autoCheckedAt: review?.auto_checked_at ?? null,
    phoneVerifiedAt: review?.phone_verified_at ?? null,
  };
}

/** How many applications sit in each status. Drives the queue's filter bar. */
export async function statusCounts(): Promise<Record<string, number>> {
  const supabase = await supabaseServer();
  const { data } = await supabase.from("applications").select("status").limit(2000);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return counts;
}
