/**
 * Generate a VAPID key pair for Web Push.
 *
 *   pnpm vapid:keys
 *
 * Prints the three lines to paste into `.env.local`. Nothing is written to
 * disk — a private key that lands in a file somebody might commit is worse than
 * one you have to paste.
 *
 * Rotating the pair invalidates every existing subscription: a browser keys its
 * subscription to the public key it was created with, so every member has to
 * turn notifications back on. Generate once per environment and keep it.
 */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log(`
Paste into apps/web/.env.local (and set the same in your host's env):

NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}
VAPID_PRIVATE_KEY=${privateKey}
VAPID_SUBJECT=mailto:you@example.com

The subject must be a mailto: or https: URL a push service can use to reach you.
Keep the private key server-side — never NEXT_PUBLIC_.
`);
