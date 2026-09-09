import { BRAND } from "@noghost/config";
import { NOTIFICATION_COPY, promptById } from "@noghost/config/copy";

/**
 * §9.4's copy, filled in — the last step before a notification is a thing
 * somebody reads.
 *
 * The copy is verbatim from the spec and §9 forbids rewriting it, so this only
 * substitutes: it never composes a sentence. A template with no line in §9.4
 * returns null and the sweep skips the row saying so, rather than inventing
 * wording for a notification that was never written.
 *
 * The enqueuers store ids, not names — `jsonb_build_object('chat_id', …)` — so
 * the counterpart's first name is resolved by the caller and passed in. That
 * is deliberate: a name is the one substitution that must come from a live read
 * under the right policy, not from whatever was true when the row was queued.
 */

/** What a rendered notification becomes on a lock screen. */
export interface RenderedNotification {
  title: string;
  body: string;
  /** Where tapping it goes, app-relative. */
  url: string;
  /**
   * Collapse key. Two warnings about the same conversation should replace each
   * other rather than stack, so this is the chat or connect id where there is
   * one.
   */
  tag: string;
}

export interface RenderContext {
  /** The other person in the chat or connect, when there is one. */
  firstName?: string;
  /** Season timezone, for formatting a date's day. */
  timeZone: string;
}

type Payload = Record<string, unknown>;

const str = (payload: Payload, key: string): string | undefined => {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

/**
 * Where tapping it goes.
 *
 * Every destination is a real route in `apps/web`. A push that opens a 404 is
 * worse than no push — it reads as the app being broken at the exact moment it
 * asked for attention.
 */
function destination(template: string, payload: Payload): string {
  const chat = str(payload, "chat_id");
  const connect = str(payload, "connect_id");

  switch (template) {
    case "drop_live":
      return "/tonight";
    case "connect_received":
      return connect ? `/inbox/${connect}` : "/inbox";
    case "connect_nudge":
      return "/inbox";
    default:
      return chat ? `/chats/${chat}` : "/chats";
  }
}

/** "Thursday" in the season's timezone, which is the only one anyone means. */
function dayLabel(iso: string, timeZone: string): string | undefined {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return undefined;
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone }).format(new Date(at));
}

export function renderNotification(
  template: string,
  payload: Payload,
  context: RenderContext,
): RenderedNotification | null {
  const copy = (NOTIFICATION_COPY as Record<string, { push?: string } | undefined>)[template];
  const line = copy?.push;
  if (!line) return null;

  const prompt = str(payload, "prompt_ref");
  const day = str(payload, "day");

  const substitutions: Record<string, string | undefined> = {
    FIRST_NAME: context.firstName,
    APP_NAME: BRAND.APP_NAME,
    PROMPT_TOPIC: prompt ? promptById(prompt)?.topic : undefined,
    PLACE: str(payload, "place"),
    DAY: day ? dayLabel(day, context.timeZone) : undefined,
  };

  /*
   * A missing substitution fails the whole render rather than leaving a hole.
   * "{{FIRST_NAME}} said yes" on a lock screen is worse than silence, and
   * quietly dropping to "Someone said yes" would be rewriting signed-off copy
   * at send time — which §9 does not allow and nobody would ever notice.
   */
  let body = line;
  for (const [token, value] of Object.entries(substitutions)) {
    const needle = `{{${token}}}`;
    if (!body.includes(needle)) continue;
    if (value === undefined) return null;
    body = body.split(needle).join(value);
  }

  return {
    title: BRAND.APP_NAME,
    body,
    url: destination(template, payload),
    /*
     * Collapsed per conversation, not per template. Two fuse warnings about the
     * same chat should replace one another on a lock screen; a warning about a
     * different chat is a different thing to know.
     */
    tag: str(payload, "chat_id") ?? str(payload, "connect_id") ?? template,
  };
}
