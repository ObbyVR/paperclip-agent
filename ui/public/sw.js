/**
 * Kill-switch service worker.
 *
 * Purpose: any previously installed paperclip service worker in a user's
 * browser (regardless of its cache strategy) will eventually fetch this file
 * during its update check (Cache-Control: max-age=0 on the server). Once
 * installed, this worker immediately:
 *   1. Deletes every cache it can see.
 *   2. Unregisters itself.
 *   3. Force-reloads all controlled clients once so they re-fetch everything
 *      from the network without a service worker in the middle.
 *
 * After that first reload there is no service worker on the origin and no
 * stale cached chunk can break the app. The page-shell will also stop
 * attempting to register this file (see main.tsx — the registration call is
 * removed in the same change), so nothing new is installed.
 *
 * If we ever want caching back we will introduce a versioned worker with a
 * proper update flow; for now "no worker at all" is strictly safer than
 * "possibly-stale worker from any prior build".
 */

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Nuke every cache again (belt-and-braces).
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));

      // Self-destruct.
      try {
        await self.registration.unregister();
      } catch {
        // Some browsers throw inside activate; the next reload will finish it.
      }

      // Take control of any open tabs and force-reload them once so they
      // re-fetch the app shell directly from the network with no worker
      // intercepting requests.
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        try {
          client.navigate(client.url);
        } catch {
          /* ignored */
        }
      }
    })(),
  );
});

// Do NOT intercept fetch events. Let every request go straight to the network.
