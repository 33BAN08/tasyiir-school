// Phase 10 step 1: the installable app. The manifest has the normal and the maskable
// icons and opens the app at /start; /sw.js is served as JavaScript at the site root
// (scope "/") and goes past the proxy; the offline page it keeps is public, static,
// in each language, and carries its marker. (Install + offline behaviour itself was
// checked in headless Chrome: the service worker cannot run in these HTTP checks.)
import { check } from "./checks.mjs";

export async function phoneAppPages({ baseUrl }) {
  const manifest = await (await fetch(new URL("/manifest.webmanifest", baseUrl))).json();
  check("[app] manifest opens at /start, standalone", manifest.start_url === "/start" && manifest.display === "standalone" && manifest.scope === "/");
  const purposes = (manifest.icons ?? []).map((i) => `${i.sizes}:${i.purpose}`);
  check(
    "[app] manifest: 192 + 512 icons, normal and maskable",
    ["192x192:any", "512x512:any", "192x192:maskable", "512x512:maskable"].every((p) => purposes.includes(p)),
    purposes.join(", "),
  );
  for (const icon of manifest.icons ?? []) {
    const res = await fetch(new URL(icon.src, baseUrl));
    check(`[app] icon ${icon.src} is served`, res.status === 200 && res.headers.get("content-type")?.includes("image/png"), `status ${res.status}`);
  }

  const sw = await fetch(new URL("/sw.js", baseUrl), { redirect: "manual" });
  const swText = sw.status === 200 ? await sw.text() : "";
  check("[app] /sw.js is served as JavaScript (not redirected to sign-in)", sw.status === 200 && /javascript/.test(sw.headers.get("content-type") ?? ""), `status ${sw.status}`);
  check("[app] the service worker keeps only the offline pages", swText.includes("/fr/offline") && !/\/portal|\/api\//.test(swText.replace(/\/\/.*$/gm, "")));

  for (const locale of ["ar", "fr", "en"]) {
    const res = await fetch(new URL(`/${locale}/offline`, baseUrl), { redirect: "manual" });
    const html = res.status === 200 ? await res.text() : "";
    check(`[app] /${locale}/offline is public with its card`, res.status === 200 && html.includes("data-offline"), `status ${res.status}`);
  }
}
