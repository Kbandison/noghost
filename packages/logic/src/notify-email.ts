import { BRAND } from "@noghost/config";
import { LIFECYCLE_EMAILS } from "@noghost/config/copy";

/**
 * §9.5's lifecycle mail, filled in — the email half of what `notify-copy.ts`
 * does for push.
 *
 * Separate from the push renderer because the two are not the same message in
 * two lengths. A push is one line that must survive a lock screen; a §9.5 email
 * is a subject, a preheader and four or five paragraphs that say what happens
 * next. Sharing a renderer would mean truncating one or padding the other.
 *
 * Pure, and returns null rather than improvising. A template §9.5 never wrote
 * has no email, and the sweep skips it saying so.
 */

export interface RenderedEmail {
  subject: string;
  /** The line a client shows beside the subject. Never repeated in the body. */
  preheader: string;
  paragraphs: string[];
}

export interface EmailContext {
  seasonName?: string;
  seasonEndDate?: string;
  /** Where the mail sends them. Absolute — a relative link is dead in an inbox. */
  link?: string;
  claimHours?: number;
  claimDeadline?: string;
  priceCents?: number;
  seasonWeeks?: number;
}

type Payload = Record<string, unknown>;

const str = (payload: Payload, key: string): string | undefined => {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const money = (cents: number): string =>
  cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;

export function renderEmail(
  template: string,
  payload: Payload,
  context: EmailContext,
): RenderedEmail | null {
  /*
   * A broadcast is the one email whose words are not in §9 — an admin typed
   * them — so it is built here rather than looked up. Same exception the push
   * renderer makes, for the same reason.
   */
  if (template === "broadcast") {
    const body = str(payload, "body");
    if (!body) return null;
    return {
      subject: `${str(payload, "season_name") ?? BRAND.APP_NAME}`,
      preheader: body.slice(0, 120),
      paragraphs: [body],
    };
  }

  // Widened through `unknown`: the literal type carries `signedOff` and exact
  // string values, which do not structurally match a lookup by arbitrary key.
  const copy = (
    LIFECYCLE_EMAILS as unknown as Record<
      string,
      { subject: string; preheader: string; body: readonly string[] } | undefined
    >
  )[template];

  /*
   * `claim_reminder` is in §9.5 and is `smsOnly` — it has no subject and no
   * body at all. §8 routes it to sms alone so this should never be reached for
   * it, but reading `.subject` off it would throw rather than skip, and a
   * template that cannot be an email is exactly the thing this returns null for.
   */
  if (!copy?.subject || !copy.body?.length) return null;

  const substitutions: Record<string, string | undefined> = {
    APP_NAME: BRAND.APP_NAME,
    APP_URL: BRAND.APP_URL,
    SUPPORT_EMAIL: BRAND.SUPPORT_EMAIL,
    SEASON_NAME: context.seasonName ?? str(payload, "season_name"),
    SEASON_END_DATE: context.seasonEndDate,
    SEASON_WEEKS: context.seasonWeeks?.toString(),
    LINK: context.link,
    CLAIM_HOURS: context.claimHours?.toString(),
    CLAIM_DEADLINE: context.claimDeadline,
    PRICE: context.priceCents === undefined ? undefined : money(context.priceCents),
  };

  /*
   * A missing substitution kills the whole email, exactly as it kills a push.
   * "{{SEASON_NAME}} starts today" in somebody's inbox is worse than silence,
   * and quietly dropping to a generic word would be rewriting §9.5 at send
   * time — which §9 does not allow and nobody would ever notice.
   */
  const fill = (line: string): string | null => {
    let out = line;
    for (const [token, value] of Object.entries(substitutions)) {
      const needle = `{{${token}}}`;
      if (!out.includes(needle)) continue;
      if (value === undefined) return null;
      out = out.split(needle).join(value);
    }
    return out;
  };

  const subject = fill(copy.subject);
  const preheader = fill(copy.preheader);
  if (subject === null || preheader === null) return null;

  const paragraphs: string[] = [];
  for (const line of copy.body) {
    const filled = fill(line);
    if (filled === null) return null;
    paragraphs.push(filled);
  }

  return { subject, preheader, paragraphs };
}
