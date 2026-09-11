import { BRAND, INTEREST_TAGS, SEASON_DEFAULTS } from "@noghost/config";
import { PROMPT_LIBRARY } from "@noghost/config/copy";
import { hashSeed, seededRandom } from "@noghost/logic";
import type { Gender, Profile, Season } from "@noghost/types";

/**
 * Seed data — spec §10 Phase 0: "1 season + 40 fake profiles from generator
 * (clearly marked, admin-purgeable)".
 *
 * Every generated id begins `deadbeef-`, so a seeded row is recognisable at a
 * glance in the dashboard and `purgeSeedData()` can remove the lot with one
 * prefix match. Nothing here should ever reach production.
 */

export const SEED_ID_PREFIX = "deadbeef";

export function seedId(n: number): string {
  return `${SEED_ID_PREFIX}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export function isSeedId(id: string): boolean {
  return id.startsWith(`${SEED_ID_PREFIX}-`);
}

export const SEED_SEASON_ID = seedId(1);

/**
 * Atlanta Season One. Dates follow the §11 launch timeline: applications open
 * at S−70, the cohort locks at S−7, and the season runs eight weeks to a
 * finale. Timezone is America/New_York, so the UTC instants below are 8pm ET.
 */
export const SEED_SEASON: Season = {
  id: SEED_SEASON_ID,
  name: BRAND.SEASON_S1_NAME,
  city: BRAND.CITY_S1,
  phase: "applications_open",
  applications_open_at: "2026-07-27T04:00:00.000Z",
  starts_at: "2026-10-05T04:00:00.000Z",
  ends_at: "2026-11-30T05:00:00.000Z",
  member_cap: SEASON_DEFAULTS.memberCap,
  drop_time: SEASON_DEFAULTS.dropTime,
  drop_max: SEASON_DEFAULTS.dropMax,
  fuse_days: SEASON_DEFAULTS.fuseDays,
  claim_hours: SEASON_DEFAULTS.claimHours,
  price_early_cents: SEASON_DEFAULTS.priceEarlyCents,
  price_standard_cents: SEASON_DEFAULTS.priceStandardCents,
  early_bird_cap: SEASON_DEFAULTS.earlyBirdCap,
  encore_start_week: SEASON_DEFAULTS.encoreStartWeek,
  timezone: SEASON_DEFAULTS.timezone,
  // Null: the fixture shows the real number of seats left, which is the only
  // honest default for a field that exists to hold inventory back (0027).
  seats_display_cap: null,
  // Off, like every real season. The first cohort is small enough to read by
  // hand, and reading it by hand is how you find out whether the match
  // threshold is right before it is load bearing.
  auto_admit: false,
  created_at: "2026-07-20T00:00:00.000Z",
};

/** Applications close a week before day one — the cohort-lock date in §11. */
export const SEED_APPLICATIONS_CLOSE = "2026-09-28T04:00:00.000Z";

/** Seats claimed so far. Drives the honest counter on the marketing hero. */
export const SEED_SEATS_CLAIMED = 84;

const FIRST_NAMES = [
  "Maya", "Devon", "Priya", "Marcus", "Nia", "Theo", "Camille", "Andre",
  "Simone", "Wes", "Imani", "Jonah", "Rosa", "Kwame", "Elena", "Beau",
  "Aaliyah", "Nico", "Tessa", "Malik", "Junie", "Ravi", "Cleo", "Owen",
  "Sade", "Bennett", "Yara", "Cyrus", "Delia", "Amos", "Noor", "Reggie",
  "Fionna", "Damon", "Perla", "Silas", "Adaeze", "Gus", "Lark", "Emmett",
] as const;

/*
 * Place names for the fixtures, and nothing more.
 *
 * These used to live in `@noghost/config` as clustered pick-lists, and the drop
 * scorer matched on the cluster — which meant the second city needed a second
 * list and a code change. Matching is arithmetic on a coordinate now, so the
 * only thing left that wants Atlanta place names is seed data that pretends to
 * be Atlanta people. A fixture list belongs in the fixtures.
 */
const SEED_NEIGHBORHOODS = [
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
  "Sandy Springs",
  "Dunwoody",
  "Brookhaven",
  "Chamblee",
  "Decatur",
  "Avondale Estates",
  "East Point",
  "College Park",
  "Tucker",
  "Smyrna",
  "Vinings",
] as const;

const OCCUPATIONS = [
  "ER nurse", "line cook", "structural engineer", "middle-school teacher",
  "bike mechanic", "public defender", "sound engineer", "florist",
  "data analyst", "physical therapist", "brewer", "librarian",
  "electrician", "landscape architect", "barista and sometime potter",
  "social worker", "video editor", "pastry chef", "urban planner", "paramedic",
] as const;

const PROMPT_ANSWERS: Record<string, string[]> = {
  prompt_01: [
    "I have opinions about which stretch of the Beltline is best at 7am.",
    "I still call it the Sears building and I will not be taking questions.",
    "I know exactly which Publix to avoid on a Sunday.",
  ],
  prompt_02: [
    "…us realising we've been at the table two hours past closing.",
    "…with both of us already arguing about where to go next time.",
    "…on a walk neither of us suggested out loud.",
  ],
  prompt_03: [
    "The Braves' bullpen management. Bring a chair.",
    "Why every good bakery smells slightly different.",
    "The specific genius of a well-made public bus route.",
  ],
  prompt_04: [
    "I remember what you told me last time and I ask about it.",
    "I say the awkward thing early instead of letting it sit.",
    "I'm genuinely happy for people, including strangers.",
  ],
  prompt_05: [
    "…I will absolutely reorganise your kitchen if you leave me alone in it.",
    "…I narrate documentaries out loud. Every time.",
    "…I'm early to everything and slightly smug about it.",
  ],
  prompt_06: [
    "That being busy meant anything at all.",
    "Cilantro. Fourteen years of being wrong, corrected in one meal.",
    "That I needed to have the whole plan before starting.",
  ],
  prompt_07: [
    "…you want someone who texts back within the hour. I'm a once-a-day person.",
    "…quiet Sundays sound like a waste of a weekend to you.",
    "…you're looking for something casual. I'm not, and I'd rather say so.",
  ],
  prompt_08: [
    "My neighbour's dog has learned to open the screen door and act innocent.",
    "A toddler at the market told me my haircut was 'a choice'.",
    "My own attempt at a sourdough starter. It's named and it's failing.",
  ],
  prompt_09: [
    "…halfway up something steep with no signal.",
    "…cooking for more people than I have chairs for.",
    "…in the third hour of a project I said would take one.",
  ],
  prompt_10: [
    "…drove to Savannah for a sandwich. It was worth it. I'd do it again.",
    "…accidentally joined a wedding photo and got sent the prints.",
    "…rebuilt an engine off a library book and it actually started.",
  ],
  prompt_11: [
    "A hot dog is a sandwich and the debate is beneath us.",
    "Restaurant butter should be room temperature or it's a hostility.",
    "Grits do not need sugar and I'll die on this.",
  ],
  prompt_12: [
    "…someone I'd want to introduce to my sister.",
    "…to have been genuinely surprised at least once.",
    "…fewer, better conversations. That's the whole ask.",
  ],
};

const GENDERS: Gender[] = ["man", "woman", "nonbinary"];

/**
 * Deterministic generator — the same array every run, so screenshots, tests,
 * and the local UI stay stable across sessions.
 */
export function generateSeedProfiles(count = 40): Profile[] {
  const random = seededRandom(hashSeed("noghost-atlanta-season-one"));
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;

  /*
   * Coordinates draw from their OWN stream, and that is not tidiness.
   *
   * Every profile is generated from one shared sequence, so a field added in
   * the middle shifts every draw after it — including the next profile's
   * birthdate. The database refuses that: `freeze_identity_after_admission`
   * locks first_name, birthdate and gender once an application is admitted, and
   * it binds the service role too. A re-seed after adding a field therefore
   * fails outright rather than quietly reshuffling forty identities, which is
   * the trigger doing its job.
   *
   * A separate stream means the geo fields can change, or be removed, without
   * moving anybody's birthday. The next field added here should get one too.
   */
  const geoRandom = seededRandom(hashSeed("noghost-geography"));
  const geoPick = <T>(items: readonly T[]): T =>
    items[Math.floor(geoRandom() * items.length)] as T;

  return Array.from({ length: count }, (_, i) => {
    const gender = GENDERS[i % 3] as Gender;

    // Roughly half straight, with the rest spread across the other options, so
    // the drop's orientation filter has something real to chew on.
    const seeking: Gender[] =
      random() < 0.55
        ? [gender === "man" ? "woman" : gender === "woman" ? "man" : "nonbinary"]
        : (GENDERS.filter(() => random() < 0.6) as Gender[]);
    if (seeking.length === 0) seeking.push(pick(GENDERS));

    const age = 23 + Math.floor(random() * 17); // 23–39
    const birthYear = 2026 - age;
    const birthMonth = 1 + Math.floor(random() * 12);
    const birthDay = 1 + Math.floor(random() * 28);

    const promptIds = [...PROMPT_LIBRARY]
      .sort(() => random() - 0.5)
      .slice(0, 3)
      .map((p) => p.id);

    const interestCount = 5 + Math.floor(random() * 6);
    const interests = [...INTEREST_TAGS]
      .sort(() => random() - 0.5)
      .slice(0, interestCount);

    const ageMin = Math.max(21, age - 4 - Math.floor(random() * 5));
    const ageMax = age + 3 + Math.floor(random() * 8);

    return {
      id: seedId(100 + i),
      first_name: FIRST_NAMES[i % FIRST_NAMES.length] as string,
      birthdate: `${birthYear}-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}`,
      gender,
      seeking,
      age_min: ageMin,
      age_max: ageMax,
      interests,
      neighborhood: pick(SEED_NEIGHBORHOODS),
      /*
       * Scattered around Atlanta rather than stacked on one point: identical
       * coordinates would give every seeded pair the full proximity bonus and
       * make the scorer look like it was doing nothing.
       */
      lat: Math.round((33.75 + (geoRandom() - 0.5) * 0.34) * 1000) / 1000,
      lng: Math.round((-84.39 + (geoRandom() - 0.5) * 0.44) * 1000) / 1000,
      travel_radius_km: geoPick([10, 25, 25, 50]),
      height_cm: 155 + Math.floor(random() * 35),
      occupation: pick(OCCUPATIONS),
      // Photos are intentionally empty: Phase 4 of the LuxWeb workflow sources
      // real imagery, and a placeholder service would ship as demo code.
      photos: [],
      prompts: promptIds.map((prompt_id) => ({
        prompt_id,
        answer: pick(PROMPT_ANSWERS[prompt_id] ?? ["…"]),
      })),
      voice_intro_path: null,
      phone: null,
      // A fixture gets a routable-looking but undeliverable address, so the
      // email channel can be exercised without a seeded profile ever being
      // able to receive real mail.
      email: `seed-${seedId(100 + i).slice(-4)}@noghost.test`,
      status: "active" as const,
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    } satisfies Profile;
  });
}

export const SEED_PROFILES = generateSeedProfiles();
