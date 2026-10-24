// Tasyir service worker (Phase 10). Keeps NO school data: only the "no connection"
// page of each language and the files it needs, so a parent who opens the app
// without network sees a clear message instead of the browser's error.
// Web push (Phase 10 step 4): the server sends the sentence already written in the
// parent's language; a tap opens (or focuses) the page it is about.

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

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = {};
  }
  const title = message.title || "Tasyir";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: message.body || "",
      tag: message.tag,
      lang: message.lang,
      dir: message.lang === "ar" ? "rtl" : "auto",
      icon: "/brand/tasyir-icon-192.png",
      badge: "/brand/tasyir-icon-white-512.png",
      data: { url: message.url || "/start" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/start", self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        try {
          await open.focus();
          await open.navigate(url.href);
          return;
        } catch {
          // A window this worker does not control cannot be navigated: open a new one.
        }
      }
      await self.clients.openWindow(url.href);
    })(),
  );
});
