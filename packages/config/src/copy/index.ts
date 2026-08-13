/**
 * Copy library — spec §9.
 *
 * Every user-facing string in the product comes from here. Spec §13:
 * "All copy comes verbatim from §9 — never write placeholder or improvised
 * user-facing text; if a string is missing, stop and ask."
 *
 * The one documented exception is the drafted email bodies in `lifecycle.ts`,
 * where §9.5 specifies content requirements rather than finished prose. Those
 * are marked `signedOff: false`.
 */
export * from "./marketing";
export * from "./closure";
export * from "./drop";
export * from "./notifications";
export * from "./empty-states";
export * from "./prompts";
export * from "./lifecycle";
export * from "./legal";
export * from "./safety";
