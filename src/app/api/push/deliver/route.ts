import { timingSafeEqual } from "node:crypto";

import { deliverPushes, vapidReady } from "@/lib/push/deliver";

// Woken by the database (pg_net, after a parent notification is queued, and every
// minute while rows wait) with the shared secret PUSH_DELIVER_SECRET. Nobody else.

function allowed(given: string | null) {
  const secret = process.env.PUSH_DELIVER_SECRET;
  if (!secret || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!allowed(request.headers.get("x-push-secret"))) {
    return Response.json({ ok: false }, { status: 401 });
  }
  if (!vapidReady()) return Response.json({ ok: false, error: "vapid" }, { status: 503 });
  try {
    return Response.json({ ok: true, ...(await deliverPushes()) });
  } catch (e) {
    console.error("push delivery failed", e instanceof Error ? e.message : "unknown");
    return Response.json({ ok: false }, { status: 500 });
  }
}
