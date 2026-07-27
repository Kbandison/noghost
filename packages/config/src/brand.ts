/**
 * Brand constants — spec §3.1.
 *
 * Renaming the product is a one-line change here. Nothing user-facing may
 * hardcode a brand string; components read from here, or from the copy
 * library (which interpolates these values into `{{VAR}}` slots).
 */
export const BRAND = {
  APP_NAME: "NoGhost",
  TAGLINE: "Dating with a start date.",
  PITCH: "Dating in seasons. Everyone starts together. Nobody gets ghosted.",
  DOMAIN: "noghost.app",
  APP_URL: "https://app.noghost.app",
  ADMIN_URL: "https://admin.noghost.app",
  SUPPORT_EMAIL: "hello@noghost.app",
  CITY_S1: "Atlanta",
  SEASON_S1_NAME: "Atlanta Season One",
} as const;

export type Brand = typeof BRAND;

/**
 * Voice rules — spec §3.2. Kept in code because the tone-check prompt
 * (packages/logic) and any future copy review both read from one source.
 */
export const VOICE_RULES = [
  "Warm, direct, human. Short sentences. Zero corporate speak.",
  "The product speaks like a good friend who tells you the truth kindly.",
  "Never shame users for passing, declining, or closing. Closure is respect, not failure.",
] as const;

/**
 * Banned patterns — spec §3.3. These are product promises, not style
 * preferences: shipping any of them breaks the pitch.
 */
export const BANNED_PATTERNS = [
  "streaks",
  "'you have X likes waiting'",
  "engagement-bait notifications",
  "paid extra drops",
  "paid fuse extensions",
  "paid undo-pass",
  "dark-pattern countdown timers (the claim window and the fuse are the only honest ones)",
] as const;

/** Dating-app clichés that are banned outright — spec §3.2. */
export const BANNED_PHRASES = ["find your person", "spark something real"] as const;
