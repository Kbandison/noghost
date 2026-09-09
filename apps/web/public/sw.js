/*
 * NoGhost service worker.
 *
 * Deliberately minimal: this exists so Web Push can exist, and for nothing
 * else. There is no offline cache and no precache manifest, because a dating
 * season is live data — a cached Tonight screen showing yesterday's drop, or a
 * cached chat missing the message that closed it, would be worse than an
 * error. If offline support is ever wanted it should be designed, not
 * inherited from a boilerplate.
 *
 * Served from /sw.js so its scope is the whole origin.
 */

self.addEventListener("install", () => {
  // Replace the previous worker immediately rather than waiting for every tab
  // to close. There is no cached state to migrate, so the usual reason to wait
  // does not apply, and a stale worker means pushes handled by old code.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    // A push we cannot parse is not shown. An empty or malformed notification
    // is worse than a missed one — it tells the member something happened and
    // then cannot say what.
    return;
  }

  if (!data || typeof data.body !== "string") return;

  event.waitUntil(
    self.registration.showNotification(data.title || data.appName || "NoGhost", {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Same tag replaces rather than stacks — the server sets it per
      // conversation, so two warnings about one chat collapse into the latest.
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: typeof data.url === "string" ? data.url : "/tonight" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/tonight", self.location.origin);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      /*
       * Focus an existing tab and navigate it rather than opening another one.
       * Tapping three notifications should not leave three copies of the app
       * open, and on a home-screen install a second window is disorienting.
       */
      for (const client of windows) {
        if (new URL(client.url).origin !== target.origin) continue;
        await client.focus();
        if ("navigate" in client) await client.navigate(target.href);
        return;
      }

      await self.clients.openWindow(target.href);
    })(),
  );
});
