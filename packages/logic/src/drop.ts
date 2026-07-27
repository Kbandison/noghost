import { clusterFor } from "@noghost/config";
import type { Gender, MemberStatus } from "@noghost/types";
import { seededShuffle } from "./random.js";
import { ageOn, seasonWeek } from "./time.js";

/**
 * The drop algorithm — spec §6.1.
 *
 * Deliberately simple and deliberately not ML. Two rules in here are brand
 * promises rather than optimisations, and must survive any future tuning:
 *
 *   1. Serving fewer than three is correct as the pool thins. Never pad.
 *   2. Reciprocity: serving is need-blind of the other side's inbox, except
 *      the activity-balance nudge. We never engineer mutual drops and never
 *      suppress on predicted rejection. This is published in the FAQ (§9.1
 *      question 6), so changing it is a public promise broken.
 */

/** A member as the drop algorithm needs to see them. */
export interface PoolProfile {
  id: string;
  gender: Gender;
  seeking: Gender[];
  birthdate: string;
  /** Stated age preference — a hard filter, not a score (spec §6.1). */
  ageMin: number;
  ageMax: number;
  neighborhood: string | null;
  interests: string[];
  status: MemberStatus;
  /** Connects received in the rolling week. Drives the activity-balance nudge. */
  incomingConnectsThisWeek: number;
}

export interface DropSeasonConfig {
  startsAt: string;
  dropMax: number;
  encoreStartWeek: number;
}

/** A profile the viewer passed on, and the week they passed. */
export interface PassRecord {
  profileId: string;
  week: number;
}

export interface BuildDropInput {
  season: DropSeasonConfig;
  /** `YYYY-MM-DD`, in the season's timezone. Half the shuffle seed. */
  dropDate: string;
  /** Moment the drop is being built, for age computation and week maths. */
  now: string;
  viewer: PoolProfile;
  /** Every other active season member. The viewer may be present; they're filtered out. */
  pool: readonly PoolProfile[];
  /** Every profile that has ever appeared on one of the viewer's cards. */
  seenProfileIds: readonly string[];
  /** Profiles the viewer passed on, with the week — drives encore eligibility. */
  passedHistory: readonly PassRecord[];
  /** Profiles with a connect to or from the viewer, in any status. One shot per pair. */
  connectedProfileIds: readonly string[];
  /** Profiles where a report exists in either direction. */
  blockedProfileIds: readonly string[];
}

export interface ScoredCandidate {
  profileId: string;
  isEncore: boolean;
  score: number;
  /** Why this profile scored what it did — surfaced in the admin console. */
  reasons: string[];
}

export interface BuildDropResult {
  cards: ScoredCandidate[];
  /** True when nothing was eligible — the honest "quiet night" state (§9.6). */
  quietNight: boolean;
  /** How many profiles survived eligibility, before the top-N cut. */
  eligibleCount: number;
}

const SCORE_SHARED_CLUSTER = 3;
const SCORE_PER_INTEREST = 1;
const SCORE_INTEREST_CAP = 3;
const SCORE_ACTIVITY_BALANCE = 2;

/** Mutual orientation match — rule 1. Both directions must be satisfied. */
export function orientationMatches(viewer: PoolProfile, other: PoolProfile): boolean {
  return viewer.seeking.includes(other.gender) && other.seeking.includes(viewer.gender);
}

/**
 * Mutual age-range match — a hard filter, not a score (spec §6.1). Each
 * person's stated range must contain the other's actual age.
 */
export function ageRangeMatches(viewer: PoolProfile, other: PoolProfile, now: string): boolean {
  const viewerAge = ageOn(viewer.birthdate, now);
  const otherAge = ageOn(other.birthdate, now);
  return (
    otherAge >= viewer.ageMin &&
    otherAge <= viewer.ageMax &&
    viewerAge >= other.ageMin &&
    viewerAge <= other.ageMax
  );
}

/**
 * Encore eligibility — spec §6.1. From `encoreStartWeek` onward, someone the
 * viewer passed on in weeks 1–2 may come back exactly once.
 */
export function isEncoreEligible(
  profileId: string,
  passedHistory: readonly PassRecord[],
  currentWeek: number,
  encoreStartWeek: number,
): boolean {
  if (currentWeek < encoreStartWeek) return false;
  return passedHistory.some((p) => p.profileId === profileId && p.week <= 2);
}

/** Median of a numeric list. Even-length lists average the middle two. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** Interest tags the two have in common. */
export function sharedInterests(a: PoolProfile, b: PoolProfile): string[] {
  const other = new Set(b.interests);
  return a.interests.filter((tag) => other.has(tag));
}

export function scoreCandidate(
  viewer: PoolProfile,
  candidate: PoolProfile,
  medianIncoming: number,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const viewerCluster = clusterFor(viewer.neighborhood);
  const candidateCluster = clusterFor(candidate.neighborhood);
  if (viewerCluster && candidateCluster && viewerCluster === candidateCluster) {
    score += SCORE_SHARED_CLUSTER;
    reasons.push(`+${SCORE_SHARED_CLUSTER} same area (${viewerCluster})`);
  }

  const shared = sharedInterests(viewer, candidate);
  if (shared.length > 0) {
    const points = Math.min(shared.length * SCORE_PER_INTEREST, SCORE_INTEREST_CAP);
    score += points;
    reasons.push(`+${points} shared interests (${shared.slice(0, 3).join(", ")})`);
  }

  // Spreads attention so the top decile doesn't absorb every connect. This is
  // the only place the algorithm looks at anyone's inbox, and it deliberately
  // helps the quieter side rather than the busier one.
  if (candidate.incomingConnectsThisWeek < medianIncoming) {
    score += SCORE_ACTIVITY_BALANCE;
    reasons.push(`+${SCORE_ACTIVITY_BALANCE} activity balance`);
  }

  return { score, reasons };
}

/**
 * Builds tonight's drop for one member.
 *
 * Pure: same inputs always produce the same cards, which is what lets
 * `generate-drops` be re-run safely (spec §4.3 — all crons are idempotent).
 */
export function buildDrop(input: BuildDropInput): BuildDropResult {
  const { season, dropDate, now, viewer, pool } = input;

  const seen = new Set(input.seenProfileIds);
  const connected = new Set(input.connectedProfileIds);
  const blocked = new Set(input.blockedProfileIds);
  const currentWeek = seasonWeek(season.startsAt, now);

  const eligible: { profile: PoolProfile; isEncore: boolean }[] = [];

  for (const candidate of pool) {
    if (candidate.id === viewer.id) continue;

    // Rule 4 — only active members are served.
    if (candidate.status !== "active") continue;

    // Rule 5 — a report in either direction removes them from each other's world.
    if (blocked.has(candidate.id)) continue;

    // Rule 3 — one shot per pair per season, in any connect status.
    if (connected.has(candidate.id)) continue;

    // Rule 1 — mutual orientation.
    if (!orientationMatches(viewer, candidate)) continue;

    // Hard age filter (spec §6.1 states this as a filter, not a score).
    if (!ageRangeMatches(viewer, candidate, now)) continue;

    // Rule 2 — never shown before, unless they qualify for an encore.
    const alreadySeen = seen.has(candidate.id);
    const encore =
      alreadySeen &&
      isEncoreEligible(candidate.id, input.passedHistory, currentWeek, season.encoreStartWeek);
    if (alreadySeen && !encore) continue;

    eligible.push({ profile: candidate, isEncore: encore });
  }

  if (eligible.length === 0) {
    return { cards: [], quietNight: true, eligibleCount: 0 };
  }

  const medianIncoming = median(eligible.map((e) => e.profile.incomingConnectsThisWeek));

  const scored: ScoredCandidate[] = eligible.map(({ profile, isEncore }) => {
    const { score, reasons } = scoreCandidate(viewer, profile, medianIncoming);
    return { profileId: profile.id, isEncore, score, reasons };
  });

  // Seeded shuffle first, then a stable sort by score. Sorting a shuffled list
  // makes the tiebreak deterministic per (user, date) without biasing toward
  // whatever order the database returned.
  const shuffled = seededShuffle(scored, `${viewer.id}:${dropDate}`);
  const ranked = [...shuffled].sort((a, b) => b.score - a.score);

  // At most one encore per drop (spec §6.1). Encores compete on score like
  // everyone else — the spec caps their number, it doesn't rank them down, and
  // inventing a penalty here would quietly bury the second-look mechanic.
  const cards: ScoredCandidate[] = [];
  let encoreUsed = false;
  for (const card of ranked) {
    if (cards.length >= season.dropMax) break;
    if (card.isEncore) {
      if (encoreUsed) continue;
      encoreUsed = true;
    }
    cards.push(card);
  }

  return { cards, quietNight: false, eligibleCount: eligible.length };
}
