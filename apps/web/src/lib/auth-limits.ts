import type { RateLimit } from "./rate-limit";

/**
 * The limits on the two endpoints anybody can reach without an account.
 *
 * Gathered here rather than inlined at the call sites so the numbers can be
 * read against each other, which is the only way to tell whether a set of rate
 * limits is coherent. Every one of them fails closed: unlike the waitlist,
 * these guard actions where the attempt *is* the attack.
 *
 * There are two shapes of abuse and they need different keys.
 *
 * **One number, many attempts** — guessing a six-digit code, or making somebody
 * else's phone buzz. Keyed on the phone.
 *
 * **One host, many numbers** — walking a range to find which numbers are
 * members, or burning the SMS budget. Keyed on the address, because a per-phone
 * limit does nothing against a script that never reuses a number.
 */

/**
 * Sending a code to one number.
 *
 * Three in a quarter hour covers a real person who did not receive the first
 * one, twice. Every attempt past that is a text somebody did not ask for, on an
 * account that may not be theirs.
 */
export const OTP_SEND_PER_PHONE: RateLimit = {
  limit: 3,
  windowSeconds: 15 * 60,
  onError: "deny",
};

/**
 * Sending codes from one host.
 *
 * The membership-oracle limit. Sign-in already refuses to say whether a number
 * has an account, but an unbounded send endpoint answers the same question
 * through timing and cost, and it does it at whatever rate the network allows.
 */
export const OTP_SEND_PER_ADDRESS: RateLimit = {
  limit: 10,
  windowSeconds: 60 * 60,
  onError: "deny",
};

/**
 * Guessing a code for one number.
 *
 * The important one. Six digits is a million combinations, which is nothing to
 * a script and everything to a person who gets five tries.
 *
 * This does mean somebody can lock a number out of *verifying* for a quarter of
 * an hour by burning its attempts — they would need the number, and they gain
 * fifteen minutes of nuisance. Accepted knowingly: the alternative is unlimited
 * guesses at the thing that is the account.
 */
export const OTP_VERIFY_PER_PHONE: RateLimit = {
  limit: 5,
  windowSeconds: 15 * 60,
  onError: "deny",
};

/** Said the same way wherever a limit is hit, so it names no mechanism. */
export const OTP_SLOW_DOWN =
  "Too many tries. Give it fifteen minutes and start again with your number.";
