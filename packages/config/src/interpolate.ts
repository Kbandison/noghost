import { BRAND } from "./brand";

/**
 * Copy variables — the same `{{VAR}}` convention the LuxWeb legal docs use
 * (spec §3.1). Every user-facing string lives in the copy library with slots;
 * components never concatenate brand or season strings themselves.
 */
export type CopyVars = Record<string, string | number>;

/**
 * Variables available to every template without being passed explicitly.
 * Season- and user-scoped values (SEASON_NAME, FIRST_NAME, …) are supplied
 * by the caller because they come from the database, not from constants.
 */
const AMBIENT_VARS: CopyVars = {
  APP_NAME: BRAND.APP_NAME,
  CITY: BRAND.CITY_S1,
  APP_URL: BRAND.APP_URL,
  DOMAIN: BRAND.DOMAIN,
  SUPPORT_EMAIL: BRAND.SUPPORT_EMAIL,
  TAGLINE: BRAND.TAGLINE,
  PITCH: BRAND.PITCH,
};

const TOKEN = /\{\{([A-Z0-9_]+)\}\}/g;

/**
 * Replaces every `{{VAR}}` in `template`.
 *
 * Throws on an unresolved token rather than rendering it. A visible
 * `{{FIRST_NAME}}` inside a closure note would be worse than an error
 * boundary — these strings carry the product's one promise.
 */
export function interpolate(template: string, vars: CopyVars = {}): string {
  const resolved = { ...AMBIENT_VARS, ...vars };
  return template.replace(TOKEN, (_match, key: string) => {
    const value = resolved[key];
    if (value === undefined) {
      throw new Error(
        `Copy template referenced {{${key}}}, which was not provided. ` +
          `Available: ${Object.keys(resolved).sort().join(", ")}`,
      );
    }
    return String(value);
  });
}

/** Every `{{VAR}}` a template needs, in source order, deduplicated. */
export function templateVars(template: string): string[] {
  return [...new Set(Array.from(template.matchAll(TOKEN), (m) => m[1] as string))];
}

/** The subset of a template's variables that ambient defaults do not cover. */
export function requiredVars(template: string): string[] {
  return templateVars(template).filter((key) => !(key in AMBIENT_VARS));
}

/** Formats integer cents as `$40` / `$49.50` — money is never a float (spec §5). */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars}`
    : `$${dollars.toFixed(2)}`;
}
