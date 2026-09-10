import webpush, { WebPushError } from "web-push";
import { BRAND } from "@noghost/config";
import type { RenderedNotification } from "@noghost/logic";

/**
 * Web Push — spec §8's push channel, and the only one in the matrix that needs
 * no third-party account.
 *
 * Server-only. `web-push` signs with the VAPID private key, which must never
 * reach a bundle; this module is imported by the sweep and by nothing that
 * renders.
 *
 * Configuration is optional on purpose. A deployment with no VAPID pair is a
 * valid state — it is how every environment starts — and it degrades to
 * `configured() === false` rather than throwing, so the sweep can defer push
 * rows and still drain everything else.
 */

export interface PushTarget {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushResult =
  | { ok: true }
  /** The subscription is gone for good — 404/410. Stop using it. */
  | { ok: false; expired: true; detail: string }
  /** Something else went wrong; the row stays pending and is retried. */
  | { ok: false; expired: false; detail: string };

let ready: boolean | null = null;

/**
 * Whether push can be sent at all. Memoised because `setVapidDetails` throws on
 * a malformed key and there is no reason to discover that once per message.
 */
export function pushConfigured(): boolean {
  if (ready !== null) return ready;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    ready = false;
    return ready;
  }

  /*
   * A subject with a scheme and nothing after it — `mailto:` on its own — is
   * what a half-finished paste leaves. `web-push` accepts it and so does FCM;
   * Mozilla's push service returns 400. Refusing here means push is uniformly
   * off rather than working in one browser and not another.
   */
  if (!/^mailto:.+@.+\..+$/.test(subject) && !/^https:\/\/.+\..+/.test(subject)) {
    console.error(
      `[push] VAPID_SUBJECT is "${subject}", which is not a contact address. ` +
        "Use mailto:you@example.com or https://example.com — a bare scheme is " +
        "accepted by FCM and rejected by Mozilla.",
    );
    ready = false;
    return ready;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    ready = true;
  } catch (cause) {
    // Loud, because a half-configured pair looks identical to an unconfigured
    // one from the outside and would silently mean nobody is ever notified.
    console.error(
      `[push] VAPID details rejected: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    ready = false;
  }
  return ready;
}

/**
 * The wire shape is `RenderedNotification` from `packages/logic` — the copy
 * renderer owns it, because it is the thing that decides what a notification
 * says and where it goes. This module only carries it.
 */
export type PushPayload = RenderedNotification;

export async function sendPush(target: PushTarget, payload: PushPayload): Promise<PushResult> {
  if (!pushConfigured()) {
    return { ok: false, expired: false, detail: "no VAPID configuration" };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: target.endpoint,
        keys: { p256dh: target.p256dh, auth: target.auth },
      },
      JSON.stringify({ ...payload, appName: BRAND.APP_NAME }),
      {
        // Long enough to survive a phone that is asleep, short enough that a
        // deadline notification is not delivered after the deadline. The
        // planner's TTL is the real rule; this stops the push service holding
        // something the planner already considers dead.
        TTL: 4 * 60 * 60,
        urgency: "normal",
      },
    );
    return { ok: true };
  } catch (cause) {
    if (cause instanceof WebPushError) {
      /*
       * 404 and 410 are the push service saying this subscription no longer
       * exists — the browser was uninstalled, the site data cleared, the
       * permission revoked. Anything else (a 500, a timeout) is transient and
       * must not retire a working subscription.
       */
      const expired = cause.statusCode === 404 || cause.statusCode === 410;
      return { ok: false, expired, detail: `${cause.statusCode} ${cause.body ?? cause.message}` };
    }
    const detail = cause instanceof Error ? cause.message : String(cause);

    /*
     * Not a `WebPushError`, so no request was ever made: `web-push` validates
     * the subscription's keys before it encrypts, and a p256dh that is not 65
     * bytes or an auth that is not 16 can never become a valid message.
     *
     * Retired rather than retried, because retrying cannot fix a length. A row
     * like this is a corrupted or hand-written subscription, and without this
     * the sweep would pick it up, fail, and pick it up again on every run
     * forever — spending a send attempt per sweep on a device that cannot
     * receive anything.
     */
    if (/should be \d+ bytes long|must be a string|Unsupported/i.test(detail)) {
      return { ok: false, expired: true, detail: `malformed subscription: ${detail}` };
    }

    return { ok: false, expired: false, detail };
  }
}
