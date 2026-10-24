// Phase 10 step 4: the delivery route. /api/push/deliver answers 401 without the
// shared secret (or with a wrong one) and goes past the proxy (no sign-in redirect);
// with it, the queued push of a parent's phone is taken, tried and reported: the
// queue row is gone and a phone the push service cannot be reached on counts one
// failure (a real phone cannot be reached from the tests). Skipped without
// PUSH_DELIVER_SECRET / VAPID keys in the test server's settings.
import { createECDH, randomBytes } from "node:crypto";

import { check, skip } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";

export async function pushDeliverActions({ fx, baseUrl }) {
  const url = new URL("/api/push/deliver", baseUrl);
  const post = (secret) => fetch(url, { method: "POST", redirect: "manual", headers: secret ? { "x-push-secret": secret } : {} });

  const none = await post(null);
  check("[push route] no secret → 401 (no sign-in redirect)", none.status === 401, `status ${none.status}`);
  const wrong = await post(randomBytes(32).toString("hex"));
  check("[push route] a wrong secret → 401", wrong.status === 401, `status ${wrong.status}`);
  const get = await fetch(url, { redirect: "manual" });
  check("[push route] GET is not served", get.status === 405, `status ${get.status}`);

  const secret = process.env.PUSH_DELIVER_SECRET;
  if (!secret || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    skip("[push route] delivery", "PUSH_DELIVER_SECRET / VAPID keys not set");
    return;
  }

  const A = fx.schools.a;
  const email = `rls-test+${fx.run}-p10route@example.com`;
  const password = `${randomBytes(12).toString("base64url")}a1`;
  const user = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user;
  fx.createdUserIds.push(user.id);
  await admin.from("profiles").insert({ id: user.id, school_id: A.id, role_id: A.roles.parent, full_name: "RLS p10route", locale: "fr", must_change_password: false });
  const client = await signIn({ email, password });

  // Keys in the browser's format, so the message is really encrypted; the address does not exist.
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const endpoint = `https://push.invalid/rls-${fx.run}/${randomBytes(8).toString("hex")}`;
  await client.rpc("save_push_subscription", {
    p_endpoint: endpoint,
    p_p256dh: ecdh.getPublicKey().toString("base64url"),
    p_auth: randomBytes(16).toString("base64url"),
    p_user_agent: "RLS",
  });
  const note = (await admin.from("notifications").insert({ school_id: A.id, recipient_id: user.id, type: "announcement", data: { title: "RLS push", announcement_id: crypto.randomUUID() } }).select("id").single()).data;

  try {
    const res = await post(secret);
    const body = res.status === 200 ? await res.json() : null;
    check("[push route] with the secret: 200 and rows taken", res.status === 200 && body?.ok === true && body.rows >= 1, `status ${res.status} ${JSON.stringify(body)}`);
    const left = (await admin.from("push_outbox").select("id").eq("notification_id", note.id)).data ?? [];
    check("[push route] the queue row is reported (gone from the queue)", left.length === 0);
    const sub = (await admin.from("push_subscriptions").select("failures, last_success_at").eq("endpoint", endpoint).single()).data;
    check("[push route] an unreachable phone counts one failure, no success", sub?.failures === 1 && sub.last_success_at === null, JSON.stringify(sub));
  } finally {
    await admin.from("notifications").delete().eq("id", note.id);
    await admin.from("push_subscriptions").delete().eq("endpoint", endpoint);
  }
}
