// Phase 10 step 5 through the app (on /fr/portal/notifications): a parent saves
// their switches (savePushPreferences); staff are refused; a bad value is refused.
// "Tester" (sendTestPush): only the parent's own phone (another parent's address =
// notFound), a bad address or language is refused, and an unreachable phone answers
// "failed" (a real phone cannot be reached from the tests; skipped without VAPID keys).
import { createECDH, randomBytes } from "node:crypto";

import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check, skip } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";

const FILE = "src/lib/push/actions.ts";
const PAGE = "/fr/portal/notifications";

export async function pushPreferencesActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const account = async (name) => {
    const email = `rls-test+${fx.run}-${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user;
    fx.createdUserIds.push(user.id);
    await admin.from("profiles").insert({ id: user.id, school_id: A.id, role_id: A.roles.parent, full_name: `RLS ${name}`, must_change_password: false });
    return { id: user.id, email, password, client: await signIn({ email, password }), cookies: await sessionCookies({ email, password }) };
  };
  const call = (name, args, cookies) => callAction(baseUrl, { id: actionId(FILE, name), path: PAGE, args, cookies });

  const par = await account("p10actp");
  const other = await account("p10acto");
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const phone = `https://push.invalid/rls-${fx.run}/${randomBytes(8).toString("hex")}`;
  const otherPhone = `https://push.invalid/rls-${fx.run}/${randomBytes(8).toString("hex")}`;
  await par.client.rpc("save_push_subscription", { p_endpoint: phone, p_p256dh: ecdh.getPublicKey().toString("base64url"), p_auth: randomBytes(16).toString("base64url"), p_user_agent: "RLS" });
  await other.client.rpc("save_push_subscription", { p_endpoint: otherPhone, p_p256dh: "BKeyOther", p_auth: "authOther", p_user_agent: "RLS" });

  try {
    const res = await fetch(new URL(PAGE, baseUrl), { redirect: "manual", headers: { Cookie: par.cookies } });
    const page = res.status === 200 ? await res.text() : "";
    check("[push prefs] the parent's notifications page renders (switches read)", res.status === 200 && !page.includes("NEXT_REDIRECT"), `status ${res.status}`);

    const saved = await call("savePushPreferences", [{ absences: true, remarks: false, announcements: true }], par.cookies);
    const row = (await admin.from("push_preferences").select("absences, remarks, announcements").eq("profile_id", par.id).maybeSingle()).data;
    check("[push prefs] a parent saves their switches", saved.ok === true && row?.remarks === false && row.absences && row.announcements, JSON.stringify({ saved, row }));
    const bad = await call("savePushPreferences", [{ absences: "yes", remarks: false, announcements: true }], par.cookies);
    check("[push prefs] a bad value → invalid", bad.ok === false && bad.error === "invalid", JSON.stringify(bad));
    const byDirector = await call("savePushPreferences", [{ absences: false, remarks: false, announcements: false }], await sessionCookies(fx.users.dirA));
    check("[push prefs] a director → forbidden", byDirector.ok === false && byDirector.error === "forbidden", JSON.stringify(byDirector));

    const badTest = await call("sendTestPush", ["http://not-https.example.com", "fr"], par.cookies);
    check("[push test] an http address → invalid", badTest.ok === false && badTest.error === "invalid", JSON.stringify(badTest));
    const badLocale = await call("sendTestPush", [phone, "de"], par.cookies);
    check("[push test] an unknown language → invalid", badLocale.ok === false && badLocale.error === "invalid", JSON.stringify(badLocale));
    const notMine = await call("sendTestPush", [otherPhone, "fr"], par.cookies);
    check("[push test] another parent's phone → notFound", notMine.ok === false && notMine.error === "notFound", JSON.stringify(notMine));
    const staffTest = await call("sendTestPush", [phone, "fr"], await sessionCookies(fx.users.dirA));
    check("[push test] a director → forbidden", staffTest.ok === false && staffTest.error === "forbidden", JSON.stringify(staffTest));

    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      skip("[push test] sending to the parent's own phone", "VAPID keys not set");
    } else {
      const mine = await call("sendTestPush", [phone, "ar"], par.cookies);
      check("[push test] own phone, unreachable here → failed (the phone stays)", mine.ok === false && mine.error === "failed" && (await admin.from("push_subscriptions").select("id").eq("endpoint", phone)).data?.length === 1, JSON.stringify(mine));
    }
  } finally {
    await admin.from("push_subscriptions").delete().in("endpoint", [phone, otherPhone]);
  }
}
