import { usingSeedData } from "@noghost/config/env";
import type { SeasonPhase } from "@noghost/types";
import {
  SEED_APPLICATIONS_CLOSE,
  SEED_SEASON,
  SEED_SEATS_CLAIMED,
} from "./seed/data.js";
import { createServiceClient } from "./supabase/service.js";

/**
 * The anon-safe season summary behind the marketing hero. Mirrors the
 * `public_season_stats` view — no PII crosses this boundary.
 */
export interface PublicSeasonStats {
  id: string;
  name: string;
  city: string;
  phase: SeasonPhase;
  startsAt: string;
  endsAt: string;
  applicationsOpenAt: string | null;
  applicationsCloseAt: string;
  memberCap: number;
  seatsRemaining: number;
  priceEarlyCents: number;
  priceStandardCents: number;
  earlyBirdCap: number;
  timezone: string;
}

function fromSeed(): PublicSeasonStats {
  return {
    id: SEED_SEASON.id,
    name: SEED_SEASON.name,
    city: SEED_SEASON.city,
    phase: SEED_SEASON.phase,
    startsAt: SEED_SEASON.starts_at,
    endsAt: SEED_SEASON.ends_at,
    applicationsOpenAt: SEED_SEASON.applications_open_at,
    applicationsCloseAt: SEED_APPLICATIONS_CLOSE,
    memberCap: SEED_SEASON.member_cap,
    seatsRemaining: Math.max(SEED_SEASON.member_cap - SEED_SEATS_CLAIMED, 0),
    priceEarlyCents: SEED_SEASON.price_early_cents,
    priceStandardCents: SEED_SEASON.price_standard_cents,
    earlyBirdCap: SEED_SEASON.early_bird_cap,
    timezone: SEED_SEASON.timezone,
  };
}

/**
 * Reads the current season for the marketing site.
 *
 * The seats counter must be a real number (spec §7.1 — "honest scarcity only"),
 * which is exactly the kind of identical-for-every-visitor query BACKEND.md
 * layer 1 says must be cached. Caching is the caller's job: the marketing page
 * wraps this in `use cache` with a short revalidate, so a viral moment is a CDN
 * hit rather than 100k queries.
 *
 * Returns null when no season is open — the waitlist page renders instead.
 */
export async function getPublicSeasonStats(): Promise<PublicSeasonStats | null> {
  if (usingSeedData()) return fromSeed();

  const supabase = createServiceClient();
  // Named columns, never `*` (BACKEND.md layer 3). Kept as one string literal:
  // supabase-js infers the row type by parsing this at the type level, and a
  // concatenated string is just `string`, which collapses the result to `never`.
  const { data, error } = await supabase
    .from("public_season_stats")
    .select("id,name,city,phase,starts_at,ends_at,applications_open_at,member_cap,seats_remaining,price_early_cents,price_standard_cents,early_bird_cap,timezone")
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to read season stats: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    city: data.city,
    phase: data.phase,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    applicationsOpenAt: data.applications_open_at,
    // Applications close a week before day one — the §11 cohort-lock date.
    applicationsCloseAt: new Date(
      Date.parse(data.starts_at) - 7 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    memberCap: data.member_cap,
    seatsRemaining: data.seats_remaining,
    priceEarlyCents: data.price_early_cents,
    priceStandardCents: data.price_standard_cents,
    earlyBirdCap: data.early_bird_cap,
    timezone: data.timezone,
  };
}
