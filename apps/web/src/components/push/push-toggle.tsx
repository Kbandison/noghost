"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { savePushSubscription, removePushSubscription } from "@/app/(app)/profile/push-actions";

/**
 * Turning on push for this browser — spec §8.
 *
 * Push is per *installation*, not per account, which is why this cannot be a
 * row in the preferences form beside it. The other switches say what you want
 * to be told; this one says whether this particular browser is a place you can
 * be told it. A member with a laptop and a phone turns it on twice, and that is
 * correct.
 *
 * Permission is requested from a click and never on load. A page that asks the
 * moment it opens gets denied — permanently, by a person who had no context for
 * the question — and a denied permission cannot be re-requested by the site.
 */

/** Capability read without an effect, so the first render is already right. */
const NEVER_CHANGES = () => () => {};
const supportsPush = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;
const assumeSupported = () => true;

/**
 * Permission is a *synchronous* read, so it is a store rather than an effect —
 * the first render already knows whether this site is blocked, and there is no
 * setState-in-effect to cascade from.
 *
 * Not subscribed to changes: `permissions.query().onchange` is uneven across
 * browsers, and the one change that matters mid-session is the one this
 * component causes itself, which it tracks locally.
 */
const readPermission = (): NotificationPermission =>
  typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default";
const assumeDefault = (): NotificationPermission => "default";

/**
 * VAPID keys travel as base64url and `applicationServerKey` wants bytes.
 * Chromium accepts the string; Firefox and Safari do not.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = window.atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  // Backed by a concrete ArrayBuffer rather than the default `ArrayBufferLike`,
  // which is not a `BufferSource` and so is not what `subscribe` accepts.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

type Status = "unknown" | "off" | "on" | "blocked";

export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const supported = useSyncExternalStore(NEVER_CHANGES, supportsPush, assumeSupported);
  const granted = useSyncExternalStore(NEVER_CHANGES, readPermission, assumeDefault);

  /** null until the async read lands. Whether *this browser* is subscribed. */
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  /** What the member just answered, which the store above cannot see. */
  const [answered, setAnswered] = useState<NotificationPermission | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Whether a subscription exists is the one part that cannot be read
   * synchronously — `getSubscription()` is a promise. The state is written
   * after an await rather than in the effect body, which is what keeps this
   * from being the cascading-render pattern the lint rule is about.
   */
  useEffect(() => {
    if (!supportsPush()) return;
    let cancelled = false;

    void (async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const existing = await registration?.pushManager.getSubscription();
        if (!cancelled) setSubscribed(Boolean(existing));
      } catch {
        // Treated as "not subscribed" rather than left unknown: the button has
        // to say something, and offering to turn it on is recoverable.
        if (!cancelled) setSubscribed(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const permission = answered ?? granted;
  const status: Status =
    permission === "denied"
      ? "blocked"
      : subscribed === null
        ? "unknown"
        : subscribed
          ? "on"
          : "off";

  async function enable() {
    if (!vapidPublicKey) return;
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      const answer = await Notification.requestPermission();
      setAnswered(answer);
      if (answer !== "granted") {
        setSubscribed(false);
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        // Required by every browser: a push that shows nothing is a push that
        // could be used to track somebody silently.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const json = subscription.toJSON();
      const result = await savePushSubscription(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
        },
        navigator.userAgent,
      );

      if (result.error) {
        // Roll the browser back so it does not hold a subscription the server
        // has no record of — the push would arrive and nothing would know why.
        await subscription.unsubscribe();
        setError(result.error);
        setSubscribed(false);
        return;
      }
      setSubscribed(true);
    } catch (cause) {
      console.error("[push] enable", cause);
      setError("This browser wouldn't turn notifications on. Try reloading the page.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const { endpoint } = subscription;
        await subscription.unsubscribe();
        await removePushSubscription(endpoint);
      }
      setSubscribed(false);
    } catch (cause) {
      console.error("[push] disable", cause);
      setError("Couldn't turn them off here. Your browser's site settings can do it.");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <p className="text-[15px] leading-relaxed text-[var(--text-dim)]">
        This browser can&rsquo;t do push notifications. Everything still reaches you inside the
        app &mdash; nothing is lost, you just have to open it.
      </p>
    );
  }

  if (!vapidPublicKey) {
    return (
      <p className="text-[15px] leading-relaxed text-[var(--text-dim)]">
        Push isn&rsquo;t set up on this deployment yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {status === "blocked" ? (
        <p className="text-[15px] leading-relaxed text-[var(--text-dim)]">
          Notifications are blocked for this site in your browser settings. We can&rsquo;t ask
          again from here &mdash; you&rsquo;d have to allow them there first.
        </p>
      ) : (
        <button
          type="button"
          onClick={status === "on" ? disable : enable}
          disabled={busy || status === "unknown"}
          className="rounded-md border border-[var(--border)] px-4 py-2.5 text-[15px] transition-colors hover:border-[var(--text-dim)] disabled:opacity-40"
        >
          {busy
            ? "One moment…"
            : status === "on"
              ? "Turn off on this device"
              : "Turn on for this device"}
        </button>
      )}

      {error && (
        <p role="alert" className="text-[15px] leading-snug text-[var(--error)]">
          {error}
        </p>
      )}

      <p className="text-[14px] leading-relaxed text-[var(--text-dim)]">
        {status === "on"
          ? "On for this browser. Every device you use needs turning on separately."
          : "Per device, not per account — the drop, a reply, and the last day of a chat."}
      </p>
    </div>
  );
}
