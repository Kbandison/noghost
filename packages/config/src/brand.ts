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
  DOMAIN: "noghostdating.app",
  /*
   * The same host as the marketing site, not `app.` — `apps/web` serves both
   * from one deployment and nothing routes by hostname, so a subdomain here
   * would be a URL the product prints and cannot serve differently.
   */
  APP_URL: "https://noghostdating.app",
  ADMIN_URL: "https://admin.noghostdating.app",
  SUPPORT_EMAIL: "hello@noghostdating.app",
  /*
   * The city a season runs in is still real — `seasons.city` drives the admin
   * console and the per-city model the whole product rests on. What changed is
   * that it stopped appearing in anything a member reads. A season named after
   * one city reads as a local product, and this one is built to open in the
   * next one without a release.
   */
  CITY_S1: "Atlanta",
  SEASON_S1_NAME: "Season One",
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
