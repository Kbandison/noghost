/** Legal & consent strings — spec §9.8, verbatim. */

export const CONSENT = {
  /**
   * The city clause is gone with it. A season runs in one place at a time and
   * `seasons.city` still records which, but asking somebody to attest to living
   * in metro Atlanta while the location step accepts a coordinate anywhere on
   * earth was a contradiction waiting to be noticed — and an attestation the
   * product had no way to check.
   */
  application:
    "I'm {{MIN_AGE}}+ and I agree to the {{APP_NAME}} Terms, Privacy Policy, and Community Standards.",

  selfie:
    "Your selfie is used only to verify you're you. Review-team eyes only, never shown to members, deleted on request.",

  /** TCPA requires this to be an explicit, unchecked opt-in at claim time. */
  sms: "Season alerts only. Never marketing. Reply STOP anytime.",
} as const;

/** Footer legal links — every page needs these (LUXWEB.md quality gate). */
export const LEGAL_LINKS = [
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Community Standards", href: "/community-standards" },
] as const;
