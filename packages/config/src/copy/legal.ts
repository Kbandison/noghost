/** Legal & consent strings — spec §9.8, verbatim. */

export const CONSENT = {
  /**
   * 21+ is a Season One curation choice, not a legal minimum — revisit for S2
   * (spec §9.8, and §12 lists the 18–20 tier as a Season Two decision).
   */
  application:
    "I'm {{MIN_AGE}}+, I live in metro {{CITY}}, and I agree to the {{APP_NAME}} Terms, Privacy Policy, and Community Standards.",

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
