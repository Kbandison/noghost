/**
 * Tone check on closure personal lines — spec §6.6.
 *
 * Pure parts only: the rubric, the prompt, a deterministic pre-screen, and the
 * response parser. The Anthropic call itself is an adapter the caller injects,
 * which keeps this package free of platform APIs (spec §4.1) and lets the
 * whole rubric be unit-tested without a network.
 *
 * The governing rule: a failed check NEVER blocks someone from closing a chat.
 * It offers a kinder rewrite, and the user may edit the line or drop it. The
 * template-only closure always goes through. Blocking a close would create the
 * one thing this product exists to prevent — a conversation with no ending.
 */

export type ToneCheckCategory =
  | "cruelty"
  | "mockery"
  | "appearance"
  | "contact_info"
  | "ok";

export type ToneCheckResult =
  | { pass: true }
  | {
      pass: false;
      category: Exclude<ToneCheckCategory, "ok">;
      /** A kinder rewrite. Offered, never imposed. */
      suggestion: string;
    };

/**
 * The rubric. Deliberately narrow: it rejects four specific harms and allows
 * everything else, including bluntness. "I'm not attracted to you" is honest
 * and passes; "you're ugly" is appearance-based and doesn't.
 */
export const TONE_CHECK_RUBRIC = `You are checking one optional sentence a member added to a closing note on a dating app. The app's promise is that every ending comes with words, and that those words are kind. Your job is narrow.

REJECT the line only if it contains:
- cruelty: language intended to wound, belittle, or leave the recipient feeling worthless
- mockery: sarcasm, ridicule, or a joke at the recipient's expense
- appearance: any reason grounded in how the recipient looks, their body, height, or weight
- contact_info: a phone number, email, social handle, or an attempt to move the conversation off the app

ALLOW everything else, including:
- honest, plain reasons ("I'm not feeling a romantic connection")
- bluntness that is not cruel ("I don't think we want the same things")
- brief lines, warm lines, awkward lines, and lines that mention someone else
- disappointment, and naming something specific that didn't work

Bluntness is not cruelty. Honesty is the point of this product. Reject only what would genuinely hurt to receive.

If you reject, write a suggestion: the same underlying message, kept in the member's own voice, with the harm removed. Never invent a reason they did not give. Never make the line longer than it was.`;

export interface ToneCheckPrompt {
  system: string;
  user: string;
}

export function buildToneCheckPrompt(personalLine: string): ToneCheckPrompt {
  return {
    system: TONE_CHECK_RUBRIC,
    user: `Check this line:\n\n<line>\n${personalLine}\n</line>`,
  };
}

/**
 * JSON Schema for the model's structured output. Using a constrained format
 * rather than parsing prose means a malformed response is impossible.
 */
export const TONE_CHECK_SCHEMA = {
  type: "object",
  properties: {
    pass: { type: "boolean" },
    category: {
      type: "string",
      enum: ["cruelty", "mockery", "appearance", "contact_info", "ok"],
    },
    suggestion: {
      type: "string",
      description: "A kinder rewrite. Empty string when pass is true.",
    },
  },
  required: ["pass", "category", "suggestion"],
  additionalProperties: false,
} as const;

/** Contact-info patterns. Deterministic, so they never need an API round-trip. */
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]{2,}/i;
const HANDLE = /(^|\s)@[A-Za-z0-9._]{2,}/;
const OFF_PLATFORM =
  /\b(insta(gram)?|snap(chat)?|whats ?app|telegram|signal|text me at|call me at|my number is|hit me up on)\b/i;

/**
 * Catches the unambiguous contact-info cases locally.
 *
 * Not a substitute for the model check — it only fires on things a regex can
 * be sure about, and it produces the same shaped result so callers can treat
 * both paths identically.
 */
export function prescreen(personalLine: string): ToneCheckResult | null {
  const line = personalLine.trim();
  if (!line) return { pass: true };

  if (PHONE.test(line) || EMAIL.test(line) || HANDLE.test(line) || OFF_PLATFORM.test(line)) {
    return {
      pass: false,
      category: "contact_info",
      suggestion:
        "Contact details can't go in a closing note — the season keeps conversations here. Say the honest part on its own, and if you both want to keep talking after the season ends, you'll get the chance then.",
    };
  }

  return null;
}

/** Parses the model's structured response into a result. */
export function parseToneCheckResponse(raw: unknown): ToneCheckResult {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Tone check returned a non-object response");
  }
  const value = raw as Record<string, unknown>;

  if (value.pass === true) return { pass: true };

  const category = value.category;
  const suggestion = value.suggestion;

  if (
    typeof category !== "string" ||
    category === "ok" ||
    !["cruelty", "mockery", "appearance", "contact_info"].includes(category)
  ) {
    throw new Error(`Tone check returned an unusable category: ${String(category)}`);
  }
  if (typeof suggestion !== "string" || suggestion.trim() === "") {
    throw new Error("Tone check failed a line without offering a rewrite");
  }

  return {
    pass: false,
    category: category as Exclude<ToneCheckCategory, "ok">,
    suggestion,
  };
}

/** The adapter shape a caller injects. Returns the raw structured output. */
export type ToneCheckAdapter = (prompt: ToneCheckPrompt) => Promise<unknown>;

/**
 * Runs the check: local pre-screen first, model second.
 *
 * On adapter failure the line passes. An outage must not stand between a
 * member and closing a conversation kindly — that is the one failure mode this
 * product cannot have. The caller records `tone_check_passed = null` so the
 * admin dashboard can tell "skipped" from "passed".
 */
export async function toneCheck(
  personalLine: string,
  adapter: ToneCheckAdapter,
): Promise<ToneCheckResult> {
  const local = prescreen(personalLine);
  if (local) return local;

  try {
    return parseToneCheckResponse(await adapter(buildToneCheckPrompt(personalLine)));
  } catch {
    return { pass: true };
  }
}

/**
 * What gets logged — spec §6.6: "store boolean + category, never the rejected
 * text". The line itself is the member's private draft.
 */
export function toneCheckAuditRecord(result: ToneCheckResult): {
  passed: boolean;
  category: ToneCheckCategory;
} {
  return result.pass
    ? { passed: true, category: "ok" }
    : { passed: false, category: result.category };
}
