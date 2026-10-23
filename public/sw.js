// Tasyir service worker (Phase 10). Keeps NO school data: only the "no connection"
// page of each language and the files it needs, so a parent who opens the app
// without network sees a clear message instead of the browser's error.
// Web push is added in Phase 10 step 4.

const CACHE = "tasyir-offline-v1";
const OFFLINE_PAGES = ["/ar/offline", "/fr/offline", "/en/offline"];
const ASSET = /\/_next\/static\/[^"'\s)]+\.(?:css|woff2)/g;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const assets = new Set();
      for (const page of OFFLINE_PAGES) {
        const response = await fetch(page, { cache: "reload" });
        if (!response.ok) continue;
        const html = await response.clone().text();
        for (const match of html.matchAll(ASSET)) assets.add(match[0]);
        await cache.put(page, response);
      }
      await cache.addAll([...assets]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("tasyir-offline-") && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  // A page: always from the network; only when that fails, the offline page in its language.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const locale = new URL(request.url).pathname.split("/")[1];
        const page = OFFLINE_PAGES.includes(`/${locale}/offline`) ? `/${locale}/offline` : OFFLINE_PAGES[0];
        return (await caches.match(page)) ?? Response.error();
      }),
    );
    return;
  }

  // The offline page's stylesheets and fonts, when the network is gone.
  if (new URL(request.url).pathname.startsWith("/_next/static/")) {
    event.respondWith(fetch(request).catch(async () => (await caches.match(request)) ?? Response.error()));
  }
});
