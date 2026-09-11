/**
 * Season defaults — spec §2 (locked decisions) and §5 (`seasons` table defaults).
 *
 * These are the values a new season row is seeded with. At runtime every
 * mechanic reads the season row, never these constants: spec §5 requires
 * "ALL mechanics read config from this row — nothing hardcoded". These exist
 * so the seed script and the admin "new season" form start from one place.
 */
export const SEASON_DEFAULTS = {
  memberCap: 300,
  dropTime: "20:00",
  dropMax: 3,
  fuseDays: 7,
  claimHours: 72,
  priceEarlyCents: 4000,
  priceStandardCents: 5000,
  earlyBirdCap: 100,
  encoreStartWeek: 5,
  timezone: "America/New_York",
  weeks: 8,
} as const;

export type SeasonDefaults = typeof SEASON_DEFAULTS;

/**
 * Atlanta neighborhood clusters — used by the drop scorer (+3 shared cluster,
 * spec §6.1). Free pick-list on the profile; the cluster is derived, so adding
 * a neighborhood never requires a scoring change.
 */
export const NEIGHBORHOOD_CLUSTERS = {
  "in-town": [
    "Old Fourth Ward",
    "Inman Park",
    "Grant Park",
    "Midtown",
    "Virginia-Highland",
    "West End",
    "East Atlanta",
    "Kirkwood",
    "Cabbagetown",
    "Downtown",
    "Westside / Howell Mill",
    "Buckhead",
    "Reynoldstown",
    "Summerhill",
    "Poncey-Highland",
    "Candler Park",
    "Ormewood Park",
  ],
  "otp-north": [
    "Sandy Springs",
    "Dunwoody",
    "Brookhaven",
    "Chamblee",
    "Roswell",
    "Alpharetta",
    "Marietta",
    "Smyrna",
    "Vinings",
    "Doraville",
    "Norcross",
    "Duluth",
    "Johns Creek",
  ],
  "otp-south": [
    "Decatur",
    "Avondale Estates",
    "East Point",
    "College Park",
    "Hapeville",
    "Stonecrest",
    "Tucker",
    "Stone Mountain",
    "Riverdale",
    "Jonesboro",
    "Fayetteville",
    "Douglasville",
  ],
} as const;

export type NeighborhoodCluster = keyof typeof NEIGHBORHOOD_CLUSTERS;

/** All neighborhoods, flattened — the profile builder's pick-list. */
export const NEIGHBORHOODS: readonly string[] = Object.values(NEIGHBORHOOD_CLUSTERS).flat();

/** Which cluster a neighborhood belongs to, or null if unrecognised. */
export function clusterFor(neighborhood: string | null | undefined): NeighborhoodCluster | null {
  if (!neighborhood) return null;
  for (const [cluster, list] of Object.entries(NEIGHBORHOOD_CLUSTERS)) {
    if ((list as readonly string[]).includes(neighborhood)) {
      return cluster as NeighborhoodCluster;
    }
  }
  return null;
}

/**
 * Interest tags — members pick 5–10 (spec §7.2 onboarding). Overlap scores
 * +1 each, capped at +3 in the drop scorer.
 */
export const INTEREST_TAGS = [
  "live music",
  "running",
  "climbing",
  "cooking",
  "dive bars",
  "natural wine",
  "coffee",
  "hiking",
  "cycling",
  "pickup basketball",
  "soccer",
  "yoga",
  "lifting",
  "film",
  "theatre",
  "stand-up",
  "reading",
  "writing",
  "podcasts",
  "board games",
  "video games",
  "photography",
  "painting",
  "pottery",
  "thrifting",
  "farmers markets",
  "brunch",
  "barbecue",
  "vegetarian cooking",
  "baking",
  "dogs",
  "cats",
  "gardening",
  "travel",
  "camping",
  "fishing",
  "motorcycles",
  "cars",
  "woodworking",
  "sewing",
  "dancing",
  "karaoke",
  "trivia",
  "church",
  "volunteering",
  "politics",
  "startups",
  "investing",
  "history",
  "astronomy",
] as const;

export type InterestTag = (typeof INTEREST_TAGS)[number];

/** Genders and orientation targets — spec §5 `profiles.gender` / `.seeking`. */
export const GENDERS = ["man", "woman", "nonbinary"] as const;
export type Gender = (typeof GENDERS)[number];

export const GENDER_LABELS: Record<Gender, string> = {
  man: "Man",
  woman: "Woman",
  nonbinary: "Nonbinary",
};

/** Season One is 21+ — a curation choice, not a legal minimum (spec §9.8). */
export const MIN_AGE = 21;

/** Photo and prompt counts enforced by the profile builder (spec §5, §7.2). */
export const PHOTO_MIN = 3;
export const PHOTO_MAX = 6;
export const PROMPT_COUNT = 3;
/**
 * The top of the age slider. 99 is not a number anyone drags to — the control
 * reads "65+" at the end, and the value stored is the real ceiling so the drop
 * matcher keeps working on exact numbers.
 */
export const AGE_RANGE_TOP = 65;

export const INTEREST_MIN = 5;
export const INTEREST_MAX = 10;
export const VOICE_INTRO_MAX_MS = 30_000;

/**
 * A confirmed date must be at least 2h and at most 14 days out — spec §6.3.
 * This is the anti-loophole rule: without it, "a date in 2027" would pause a
 * fuse forever.
 */
export const DATE_MIN_LEAD_HOURS = 2;
export const DATE_MAX_LEAD_DAYS = 14;

/** Fuse warning thresholds, in hours before expiry — spec §6.3. */
export const FUSE_WARN_HOURS = [48, 24] as const;

/** A cancelled date never insta-kills a chat — spec §6.3. */
export const FUSE_RESUME_FLOOR_HOURS = 48;

/** Post-date check-in opens at date + 24h, closes unanswered at +72h — spec §6.3. */
export const CHECKIN_OPEN_AFTER_HOURS = 24;
export const CHECKIN_EXPIRE_AFTER_HOURS = 72;

/** A pending connect gets one nudge at 72h — spec §6.2. Exactly one. */
export const CONNECT_NUDGE_HOURS = 72;

/**
 * How many digits a phone OTP has.
 *
 * NOT six. Supabase issues 6–10 and the length is a per-project setting, so the
 * app cannot assume one — it was assuming six in eight places, including a
 * `maxLength={6}` that silently swallowed the seventh digit of a correct code
 * and then said "that code didn't match". A member would have retyped it until
 * they gave up.
 *
 * Validated as a range rather than read from config, because the app has no way
 * to ask Supabase what it is set to; accepting the whole supported range and
 * letting the server be the judge is the honest version.
 */
export const OTP_MIN_DIGITS = 6;
export const OTP_MAX_DIGITS = 10;
export const OTP_PATTERN = /^\d{6,10}$/;

/** Quiet hours — nothing sends between these times, local — spec §8. */
export const QUIET_HOURS = { startHour: 23, endHour: 9 } as const;

/**
 * The cohort locks a week before day one — §11's S−7 milestone. That is when a
 * season stops taking applications and enters `pre_season`, which deliberately
 * does not serve drops: the pool is still forming, and a drop built from a
 * half-full cohort would burn first impressions on whoever claimed early.
 */
export const COHORT_LOCK_DAYS = 7;

/**
 * The last week of a season is its own phase — §9.5.5's "final week + finale
 * event". It still serves drops; what changes is that everyone is told the end
 * is coming, which is the opposite of a season that simply stops.
 */
export const FINALE_WEEK_DAYS = 7;
