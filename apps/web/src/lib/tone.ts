import Anthropic from "@anthropic-ai/sdk";
import {
  TONE_CHECK_SCHEMA,
  toneCheck,
  type ToneCheckPrompt,
  type ToneCheckResult,
} from "@noghost/logic";

/**
 * The tone check's Claude adapter — spec §6.6.
 *
 * `toneCheck` is pure and takes the model call as an argument; this is the one
 * implementation of it. Two properties matter more than accuracy:
 *
 *   1. **It never blocks a close.** §6.6 is explicit: on a fail the member is
 *      offered a kinder rewrite and chooses. On an outage, a missing key, or an
 *      unparseable response, the line passes. An ending must never be stuck
 *      behind an API — that is the one failure mode this product cannot have.
 *   2. **The rejected text is never stored.** `toneCheckAuditRecord` keeps a
 *      boolean and a category and nothing else. The line is the member's
 *      private draft.
 *
 * With no `ANTHROPIC_API_KEY` set, only the local pre-screen runs — which is
 * still worth having: it catches phone numbers, emails, handles and
 * "let's talk on…", the cases a regex can be certain about.
 */

/**
 * §6.6 names the model and the temperature, and the pair is only valid
 * together on this tier: `temperature` is **rejected with a 400** on Opus 4.7
 * and later and on Sonnet 5. Upgrading this model means deleting the
 * temperature line in the same commit, not after the first 400.
 */
const MODEL = "claude-sonnet-4-6";

/** A tone check is a short classification, not an essay. */
const MAX_TOKENS = 512;

/**
 * Someone is waiting on a button with a closing note half-written, so a call
 * that hangs is functionally an outage — and `toneCheck` treats a throw as a
 * pass. Milliseconds: the TypeScript SDK's timeout unit differs from Python's.
 */
const TIMEOUT_MS = 8_000;

const TOOL_NAME = "record_tone_check";

/*
 * `TONE_CHECK_SCHEMA` is declared `as const`, which makes it deeply readonly —
 * and the SDK's `input_schema` wants mutable arrays for `required` and `enum`.
 * Structurally identical, so one cast at the boundary is honest; deep-cloning
 * it to satisfy the variance would just hide where the mismatch is.
 */
const TONE_CHECK_TOOL: Anthropic.ToolUnion = {
  name: TOOL_NAME,
  description: "Record the verdict on the member's closing line.",
  input_schema: TONE_CHECK_SCHEMA as unknown as Anthropic.Tool.InputSchema,
};

/**
 * Forced tool use, not `output_config.format`.
 *
 * Structured outputs and `strict: true` are not available on Sonnet 4.6 — they
 * start at the Opus 4.8 / Sonnet 5 tier — so the schema is carried as a tool's
 * `input_schema` and the tool is forced. The model must answer in that shape,
 * and `parseToneCheckResponse` still validates what comes back rather than
 * trusting it: a malformed reply throws, and a throw is a pass.
 */
async function callClaude(prompt: ToneCheckPrompt): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("no ANTHROPIC_API_KEY — pre-screen only");

  const client = new Anthropic({ apiKey, maxRetries: 1 });

  const response = await client.messages.create(
    {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // §6.6: a fixed rubric at temperature 0. The same line must get the same
      // answer twice, or "we checked your note" means nothing.
      temperature: 0,
      // Deliberately off, at the lowest effort. This is a one-sentence
      // classification against a fixed rubric; Sonnet 4.6 defaults to `high`,
      // which would spend thinking tokens deliberating over "you seem nice".
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
      tools: [TONE_CHECK_TOOL],
      tool_choice: { type: "tool", name: TOOL_NAME },
    },
    { timeout: TIMEOUT_MS },
  );

  const verdict = response.content.find((block) => block.type === "tool_use");
  if (!verdict) throw new Error("tone check returned no verdict");
  return verdict.input;
}

export async function checkTone(personalLine: string): Promise<ToneCheckResult> {
  return toneCheck(personalLine, async (prompt) => {
    try {
      return await callClaude(prompt);
    } catch (error) {
      // Logged, then rethrown: `toneCheck` turns a throw into a pass, and an
      // outage that silently stops checking notes should still be visible to
      // whoever runs this.
      console.error(
        `[tone] check unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  });
}

/** Whether the model half actually ran, for `closure_notes.tone_check_passed`. */
export const toneCheckConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);
