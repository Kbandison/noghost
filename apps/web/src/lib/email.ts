import { Resend } from "resend";
import { BRAND } from "@noghost/config";
import type { RenderedEmail } from "@noghost/logic";

/**
 * Transactional email — §8's `email` channel, and the second transport the
 * sweep has ever had.
 *
 * Server-only. Shaped deliberately like `lib/push.ts`: `emailConfigured()`
 * before anything is attempted, a result type that separates "this address will
 * never work" from "try again later", and no throwing — one member's dead
 * address must not stop a sweep.
 *
 * Configuration is optional for the same reason push's is. A deployment with no
 * `RESEND_API_KEY` is a valid state — it is how every environment starts — and
 * it degrades to `configured() === false` so the sweep defers email rows and
 * still drains everything else.
 */

export type EmailResult =
  | { ok: true; id: string | null }
  /** The address is bad. Retrying will not fix it. */
  | { ok: false; permanent: true; detail: string }
  /** Transient — rate limit, outage. The row stays pending. */
  | { ok: false; permanent: false; detail: string };

let client: Resend | null = null;
let ready: boolean | null = null;

export function emailConfigured(): boolean {
  if (ready !== null) return ready;

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    ready = false;
    return ready;
  }

  try {
    client = new Resend(key);
    ready = true;
  } catch (cause) {
    console.error(
      `[email] Resend rejected the key: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    ready = false;
  }
  return ready;
}

/**
 * The sender.
 *
 * Read from env rather than derived from `BRAND.DOMAIN`, because the domain
 * that is *verified at Resend* is not necessarily the one the product is named
 * after — and sending from an unverified domain is a 550 that looks exactly
 * like a missing key. Falls back to the brand's support address, which is the
 * right answer once that domain is verified.
 */
const from = (): string => process.env.EMAIL_FROM ?? `${BRAND.APP_NAME} <${BRAND.SUPPORT_EMAIL}>`;

/**
 * §9.5's paragraphs as a plain, readable email.
 *
 * Deliberately almost no markup. These are letters from a person — §3.2's voice
 * — and a templated masthead with a hero image would be the corporate register
 * §3.3 bans. The preheader is hidden rather than printed: mail clients show it
 * beside the subject, and repeating it as the first line reads like a stutter.
 */
function html(mail: RenderedEmail): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const body = mail.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2A2622;">${escape(p)}</p>`,
    )
    .join("");

  return `<!doctype html><html><body style="margin:0;padding:0;background:#FAF7F2;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(mail.preheader)}</span>
<div style="max-width:34rem;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
${body}
<p style="margin:32px 0 0;font-size:13px;line-height:1.5;color:#8A8178;">${escape(BRAND.APP_NAME)} · ${escape(BRAND.DOMAIN)}</p>
</div></body></html>`;
}

export async function sendEmail(to: string, mail: RenderedEmail): Promise<EmailResult> {
  if (!emailConfigured() || !client) {
    return { ok: false, permanent: false, detail: "no RESEND_API_KEY" };
  }

  try {
    const { data, error } = await client.emails.send({
      from: from(),
      to,
      subject: mail.subject,
      html: html(mail),
      // Every client that prefers plain text gets the same words, which is the
      // point of §9.5 being paragraphs rather than a layout.
      text: `${mail.paragraphs.join("\n\n")}\n\n${BRAND.APP_NAME} · ${BRAND.DOMAIN}`,
    });

    if (error) {
      /*
       * Resend reports a rejected recipient and a rate limit through the same
       * field, and only one of them is worth retrying. An invalid address will
       * be invalid on every future sweep, so it is retired rather than carried
       * forever.
       */
      const detail = `${error.name ?? "error"}: ${error.message}`;
      const permanent = /invalid|not a valid|recipient|does not exist|unverified|domain/i.test(
        detail,
      );
      return { ok: false, permanent, detail };
    }

    return { ok: true, id: data?.id ?? null };
  } catch (cause) {
    return {
      ok: false,
      permanent: false,
      detail: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
