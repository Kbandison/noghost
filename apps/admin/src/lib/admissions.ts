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
  livenessScore: number | null;
  livenessPassed: boolean | null;
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

  const [{ data: profile }, { data: verification }] = await Promise.all([
    supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", application.user_id).maybeSingle(),
    supabase
      .from("verifications")
      .select("user_id,selfie_path,liveness_score,liveness_passed,phone_verified_at")
      .eq("user_id", application.user_id)
      .maybeSingle(),
  ]);

  if (!profile) return null;
  const p = profile as ProfileRow;

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
    hasSelfie: Boolean(verification?.selfie_path),
    selfiePath: verification?.selfie_path ?? null,
    livenessScore: verification?.liveness_score ?? null,
    livenessPassed: verification?.liveness_passed ?? null,
    phoneVerifiedAt: verification?.phone_verified_at ?? null,
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
