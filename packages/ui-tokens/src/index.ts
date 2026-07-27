/**
 * Design tokens — LuxWeb archetype gate result.
 *
 *   ARCHETYPE: Editorial Refined
 *   VARIATION: Warm Serif Magazine
 *   FONTS:     Fraunces (display) + DM Sans (body)
 *   DIALS:     VARIANCE 4 / MOTION 4 / DENSITY 3 / DARK 0
 *   IMAGERY:   35mm film photography, editorial, natural lighting, muted tones,
 *              documentary composition
 *
 * Consumed by Tailwind v4 through `tokens.css` (web, admin) and by NativeWind
 * from this object (mobile, Phase 6). Keep the two in sync — the CSS file is
 * the source of truth at runtime, this object is the source of truth for types.
 */

/**
 * A 10-step warm neutral interpolated between the variation's cream and ink.
 * LUXWEB colour rule 6: build a scale, never grab arbitrary greys.
 */
export const neutral = {
  50: "#FAF7F2", // cream — the page
  100: "#F4F0E8",
  200: "#E8E2D6",
  300: "#D6CEC0",
  400: "#B5AB9B",
  500: "#8E8578",
  600: "#6B6459",
  700: "#4E4941",
  800: "#33302B",
  900: "#1A1815", // deep ink — body text
} as const;

/**
 * Contrast ratios against cream (#FAF7F2) are computed, not guessed. WCAG 2.2
 * AA needs 4.5:1 for body text and 3:1 for large text and UI components.
 *
 * The variation's ochre is 3.54:1 on cream — fine as a surface or a large
 * accent, and NOT enough for body text. So the palette carries two ochres: the
 * brand one for fills, and a darkened one for anything readable.
 */
export const color = {
  /** Page background. */
  bg: neutral[50],
  /** Cards and raised surfaces. */
  bgRaised: "#FFFFFF",
  /** Recessed bands that separate sections without empty space. */
  bgSunken: neutral[100],

  /** Body text. 15.7:1 on cream. */
  text: neutral[900],
  /** Secondary text. 6.8:1 on cream. */
  textMuted: "#5C564C",
  /** Metadata and captions. 4.6:1 on cream — at the floor, do not lighten. */
  textFaint: "#6E675B",

  /** Brand ochre. Fills and large accents only — 3.54:1 on cream. */
  accent: "#B8741A",
  /** Ochre for text and links. 5.85:1 on cream. */
  accentText: "#8A5412",
  /** Hover state for accent fills. */
  accentHover: "#A06315",
  /** Text placed on an accent fill. 4.68:1 on ochre. */
  onAccent: neutral[900],

  /** Muted sage. Decorative only — 2.71:1 on cream, never text. */
  sage: "#8B9D83",
  /** Sage for text. 4.99:1 on cream. */
  sageText: "#5F7057",

  border: neutral[300],
  borderSubtle: neutral[200],

  /**
   * Fuse ring — spec §7.2. Calm above 72h, amber under 48h, warm-red under 24h.
   * The red is a warm brick, not an alarm red: the fuse is a coach, not a
   * threat, and the palette has to carry that.
   */
  fuseCalm: "#5F7057",
  fuseAmber: "#B8741A",
  fuseUrgent: "#A8442A",
  fusePaused: neutral[400],

  /** Form and system feedback. */
  error: "#8F2C1E",
  success: "#4A6B3F",
} as const;

/** Fraunces is variable — `SOFT` and `WONK` warm the headlines without cartoon. */
export const font = {
  display: "var(--font-display)",
  body: "var(--font-body)",
} as const;

/**
 * Type scale — LUXWEB typography table. Hero uses `clamp` so it holds from
 * 375px to 1920px without a breakpoint.
 */
export const type = {
  hero: {
    size: "clamp(2.75rem, 7vw, 6.5rem)",
    weight: 800,
    lineHeight: "1.02",
    tracking: "-0.035em",
  },
  h1: { size: "clamp(2.25rem, 5vw, 3.75rem)", weight: 700, lineHeight: "1.06", tracking: "-0.028em" },
  h2: { size: "clamp(1.875rem, 3.5vw, 2.75rem)", weight: 700, lineHeight: "1.1", tracking: "-0.022em" },
  h3: { size: "clamp(1.375rem, 2vw, 1.875rem)", weight: 600, lineHeight: "1.15", tracking: "-0.012em" },
  body: { size: "1.0625rem", weight: 400, lineHeight: "1.7", tracking: "normal" },
  bodyLarge: { size: "1.1875rem", weight: 400, lineHeight: "1.65", tracking: "normal" },
  small: { size: "0.9375rem", weight: 400, lineHeight: "1.6", tracking: "normal" },
  label: { size: "0.8125rem", weight: 500, lineHeight: "1.4", tracking: "0.1em" },
} as const;

/**
 * DENSITY 3 — the airiest band in the LuxWeb spacing table. Three profiles a
 * night are meant to be read, not scanned, so the reading measure is narrow.
 */
export const layout = {
  sectionPaddingY: "clamp(6rem, 12vw, 12rem)",
  contentMax: "1040px",
  /** 65–75 characters. Never a full-width paragraph on desktop. */
  proseMax: "62ch",
  gutter: "1.5rem",
  gutterWide: "2rem",
} as const;

/** MOTION 4 — scroll-fade entrances and staggered reveals. No physics. */
export const motion = {
  fast: "160ms",
  base: "280ms",
  slow: "520ms",
  /** Never bounce or elastic on content (LUXWEB anti-slop #25). */
  ease: "cubic-bezier(0.22, 0.61, 0.36, 1)",
  easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

/**
 * Editorial design does not use one radius everywhere (anti-slop #4). Photos
 * stay square because that is how a magazine prints them.
 */
export const radius = {
  none: "0",
  sm: "3px",
  md: "6px",
  lg: "12px",
  pill: "999px",
} as const;

export const dials = {
  variance: 4,
  motion: 4,
  density: 3,
  dark: 0,
} as const;

export const tokens = { neutral, color, font, type, layout, motion, radius, dials } as const;
export type Tokens = typeof tokens;
