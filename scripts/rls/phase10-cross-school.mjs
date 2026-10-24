// Phase 10 closing pass: school B's phones, switches and push queue stay school B's.
// A parent of B has a phone, switches and a queued push; a parent, a teacher and the
// director of school A read none of it (endpoints, switches, queue), cannot delete
// B's phone, change B's switches or claim B's pushes; A's own switches never change
// what B's parent is sent (control: B's parent's notification is queued).
import { randomBytes } from "node:crypto";

import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";

export async function phase10CrossSchool({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const label = (s) => `[P10 cross] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase10CrossSchool setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const code = async (query) => (await query).error?.code ?? "none";
  const account = async (name, school) => {
    const email = `rls-test+${fx.run}-${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), name).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({ id: user.id, school_id: school.id, role_id: school.roles.parent, full_name: `RLS ${name}`, must_change_password: false }), name);
    return { id: user.id, client: await signIn({ email, password }) };
  };

  const parB = await account("p10xb", B);
  const parA = await account("p10xa", A);
  const phoneB = `https://push.example.com/rls-${fx.run}/${randomBytes(8).toString("hex")}`;
  must(await parB.client.rpc("save_push_subscription", { p_endpoint: phoneB, p_p256dh: "BKeyB", p_auth: "authB", p_user_agent: "RLS" }), "phone B");
  must(await parB.client.rpc("save_push_preferences", { p_absences: true, p_remarks: true, p_announcements: true }), "prefs B");
  must(await parA.client.rpc("save_push_preferences", { p_absences: false, p_remarks: false, p_announcements: false }), "prefs A");
  const note = must(
    await admin.from("notifications").insert({ school_id: B.id, recipient_id: parB.id, type: "announcement", data: { test: true } }).select("id").single(),
    "note B",
  ).id;

  try {
    check(label("control: B's parent's announcement is queued (A's switches change nothing)"), must(await admin.from("push_outbox").select("id").eq("notification_id", note), "outbox").length === 1);

    for (const [who, client] of [["a parent of A", parA.client], ["a teacher of A", as.tchA], ["the director of A", as.dirA]]) {
      const phones = (await client.from("push_subscriptions").select("endpoint")).data ?? [];
      check(label(`${who} reads no phone of B`), !phones.some((p) => p.endpoint === phoneB));
      const prefs = (await client.from("push_preferences").select("profile_id")).data ?? [];
      check(label(`${who} reads no switches of B`), !prefs.some((p) => p.profile_id === parB.id));
      check(label(`${who} cannot read the push queue`), (await code(client.from("push_outbox").select("id"))) === "42501");
      check(label(`${who} cannot claim pushes`), (await code(client.rpc("push_claim", { p_limit: 500 }))) === "42501");
      await client.from("push_subscriptions").delete().eq("endpoint", phoneB);
      check(label(`${who} cannot delete B's phone`), must(await admin.from("push_subscriptions").select("id").eq("endpoint", phoneB), "phone").length === 1);
    }
    check(label("A's parent cannot change B's switches (saving changes only their own row)"), must(await admin.from("push_preferences").select("announcements").eq("profile_id", parB.id).single(), "prefs").announcements === true);
    check(label("B's switches stay in school B"), must(await admin.from("push_preferences").select("school_id").eq("profile_id", parB.id).single(), "prefs").school_id === B.id);
  } finally {
    await admin.from("notifications").delete().eq("id", note);
    await admin.from("push_subscriptions").delete().eq("endpoint", phoneB);
  }
}
