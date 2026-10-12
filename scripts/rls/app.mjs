// Calls the app's real Server Actions over HTTP, as a given signed-in user,
// exactly like the browser does (Next-Action header + session cookies).
// Needs a production build running: `npm run build && npm start`.
import { readFileSync } from "node:fs";

import { createServerClient } from "@supabase/ssr";

const MANIFEST = ".next/server/server-reference-manifest.json";

/** Server Action id by source file + export name (ids change with every build). */
export function actionId(filename, exportedName) {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const entry = Object.entries(manifest.node).find(
    ([, v]) => v.filename === filename && v.exportedName === exportedName,
  );
  if (!entry) throw new Error(`action ${exportedName} not found in ${MANIFEST}: run npm run build`);
  return entry[0];
}

/** Session cookies (as the app's @supabase/ssr sets them) for a fixture user. */
export async function sessionCookies(user) {
  const jar = new Map();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (cookies) => cookies.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
      },
    },
  );
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw new Error(`sign-in failed for fixture user (${error.code})`);
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

/** First object with a boolean `ok` in the RSC response (the action's return value). */
function findResult(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.ok === "boolean") return value;
  for (const v of Object.values(value)) {
    const found = findResult(v);
    if (found) return found;
  }
  return null;
}

/**
 * POSTs a Server Action. Returns its `{ ok, ... }` result, or
 * `{ ok: false, error: "http <status>" }` when the app refused before running it
 * (e.g. a redirect to /login for a signed-out caller).
 */
export async function callAction(baseUrl, { id, path, args, cookies }) {
  const res = await fetch(new URL(path, baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: {
      "Next-Action": id,
      Accept: "text/x-component",
      "Content-Type": "text/plain;charset=UTF-8",
      Origin: new URL(baseUrl).origin,
      ...(cookies ? { Cookie: cookies } : {}),
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (res.status !== 200) return { ok: false, error: `http ${res.status}` };
  for (const line of text.split("\n")) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    try {
      const found = findResult(JSON.parse(line.slice(colon + 1)));
      if (found) return found;
    } catch {
      // Not a JSON row (e.g. a text chunk): skip.
    }
  }
  return { ok: false, error: "no result in response" };
}
