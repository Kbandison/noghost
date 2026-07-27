/**
 * NoGhost season mechanics.
 *
 * Spec §4.1: "all season mechanics live in packages/logic as pure functions
 * with unit tests. Web, mobile, and cron jobs call the same functions. No
 * mechanic logic in components — ever."
 *
 * Two rules hold across every function here:
 *   1. Pure. No `Date.now()`, no I/O, no platform APIs. "Now" is an argument,
 *      which is what makes the Phase 7 full-season time-travel test possible.
 *   2. Idempotent. Applying the same event twice is a no-op, because every
 *      cron in §4.3 must be safe to re-run.
 */
export * from "./time.js";
export * from "./random.js";
export * from "./drop.js";
export * from "./fuse.js";
export * from "./connect.js";
export * from "./checkin.js";
export * from "./dates.js";
export * from "./graduation.js";
export * from "./tone-check.js";
