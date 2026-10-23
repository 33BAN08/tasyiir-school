"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js (the phone app's service worker: offline page, then web push).
 * Production builds only: in `next dev` a service worker would keep stale pages.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // No service worker (private mode, old browser): the site works the same, only without the offline page.
    });
  }, []);
  return null;
}
