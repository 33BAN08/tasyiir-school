// Phase 8 step 2: the notification pages (/portal/notifications, /notifications)
// and the Server Actions behind them — markNotificationRead, markAllNotificationsRead.
// A user marks only their own notifications; a forged id of someone else's
// changes nothing. Called over HTTP as real users on the page that registers them.
import { randomBytes, randomUUID } from "node:crypto";

import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";

const FILE = "src/lib/notifications/actions.ts";
const PAGE = "/fr/portal/notifications";

export async function notificationActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const call = (cookies, action, ...args) => callAction(baseUrl, { id: actionId(FILE, action), path: PAGE, args, cookies });

  const parent = async (name) => {
    const email = `rls-test+${fx.run}-${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    fx.createdUserIds.push(data.user.id);
    await admin.from("profiles").insert({ id: data.user.id, school_id: A.id, role_id: A.roles.parent, full_name: `RLS ${name}`, must_change_password: false });
    const user = { id: data.user.id, email, password };
    return { ...user, client: await signIn(user), cookies: await sessionCookies(user) };
  };
  const par1 = await parent("ntpar1");
  const par2 = await parent("ntpar2");
  const survCookies = await sessionCookies(fx.users.survA);

  // Notifications are written by the database only: the fixtures use the secret key.
  const make = async (who, n) => {
    const { data, error } = await admin.from("notifications")
      .insert(Array.from({ length: n }, () => ({ school_id: A.id, recipient_id: who.id, type: "absence", data: { subject: "NT-Arabe", date: "2026-10-12", start: "08:00", end: "09:00" } })))
      .select("id");
    if (error) throw new Error(`notificationActions setup: ${error.message}`);
    return data.map((r) => r.id);
  };
  const unread = async (who) => (await admin.from("notifications").select("id").eq("recipient_id", who.id).is("read_at", null)).data.length;
  const [a1, a2, a3] = await make(par1, 3);
  const [b1, b2] = await make(par2, 2);

  // --- Pages ----------------------------------------------------------------------------------------------
  const get = async (path, cookies) => {
    const res = await fetch(new URL(path, baseUrl), { headers: { cookie: cookies }, redirect: "manual" });
    return { status: res.status, html: res.status === 200 ? await res.text() : "" };
  };
  const page = await get(PAGE, par1.cookies);
  check("[P8 notif pages] a parent sees their 3 notifications, none of the other parent's",
    page.status === 200 && (page.html.match(/data-read="false"/g) ?? []).length === 3, `${page.status}, ${(page.html.match(/data-read="false"/g) ?? []).length} unread rows`);
  check("[P8 notif pages] …and the bell says 3 unread", /Notifications, 3 non lues/.test(page.html));
  const staffPage = await get("/fr/notifications", survCookies);
  check("[P8 notif pages] staff open /notifications (empty list)", staffPage.status === 200 && !staffPage.html.includes('data-read="'), String(staffPage.status));
  const wrongArea = await get("/fr/notifications", par1.cookies);
  check("[P8 notif pages] a parent opening /notifications is sent to their own area",
    wrongArea.status !== 200 || /NEXT_REDIRECT;replace;[^"]*\/portal/.test(wrongArea.html) || !wrongArea.html.includes('data-read="'), String(wrongArea.status));
  const signedOut = await get(PAGE, "");
  check("[P8 notif pages] signed out → not the list", signedOut.status !== 200 || !signedOut.html.includes('data-read="'), String(signedOut.status));

  // --- markNotificationRead --------------------------------------------------------------------------------
  const own = await call(par1.cookies, "markNotificationRead", a1);
  check("[P8 notif actions] a parent marks their notification read", own.ok === true && (await unread(par1)) === 2, JSON.stringify(own));
  await call(par1.cookies, "markNotificationRead", b1); // someone else's: no error to leak, nothing changes
  check("[P8 notif actions] …another parent's notification stays unread", (await unread(par2)) === 2);
  const bad = await call(par1.cookies, "markNotificationRead", "not-an-id");
  check("[P8 notif actions] an invalid id is refused", bad.ok === false && bad.error === "invalid", JSON.stringify(bad));
  const unknown = await call(par1.cookies, "markNotificationRead", randomUUID());
  check("[P8 notif actions] an unknown id changes nothing", unknown.ok === true && (await unread(par1)) === 2, JSON.stringify(unknown));
  const out = await call(undefined, "markNotificationRead", a2);
  check("[P8 notif actions] signed out: refused", out.ok === false && (await unread(par1)) === 2, JSON.stringify(out));

  // --- markAllNotificationsRead ------------------------------------------------------------------------------
  const all = await call(par1.cookies, "markAllNotificationsRead");
  check("[P8 notif actions] mark all read: all of the caller's…", all.ok === true && (await unread(par1)) === 0, JSON.stringify(all));
  check("[P8 notif actions] …none of another parent's", (await unread(par2)) === 2);
  const outAll = await call(undefined, "markAllNotificationsRead");
  check("[P8 notif actions] signed out: refused", outAll.ok === false && (await unread(par2)) === 2, JSON.stringify(outAll));

  // --- The mark is the real time, and read rows keep their first read time ------------------------------------
  const { data: row } = await admin.from("notifications").select("read_at").eq("id", a1).single();
  const first = row.read_at;
  await call(par1.cookies, "markNotificationRead", a1);
  const { data: again } = await admin.from("notifications").select("read_at").eq("id", a1).single();
  check("[P8 notif actions] marking an already-read notification keeps its first read time", first && again.read_at === first);

  // --- Daily alerts (step 4): their sentences; a parent's opens the child's absences, staff's the student page ---
  const { data: kid } = await admin.from("students")
    .insert({ school_id: A.id, first_name: "Alerte", last_name: "NT", birth_date: "2014-01-01", gender: "male" }).select("id").single();
  const { data: daily } = await admin.from("notifications").insert([
    { school_id: A.id, recipient_id: par1.id, type: "unjustified_absences", student_id: kid.id, data: { month: "2026-10", days: 3 } },
    { school_id: A.id, recipient_id: par1.id, type: "repeated_lateness", student_id: kid.id, data: { count: 4, window_days: 14, from: "2026-10-06", to: "2026-10-19" } },
    { school_id: A.id, recipient_id: fx.users.survA.id, type: "unjustified_absences", student_id: kid.id, data: { month: "2026-10", days: 5 } },
  ]).select("id");
  const parentPage = await get(PAGE, par1.cookies);
  check("[P8 notif pages] unjustified absences: month written in the UI language",
    parentPage.html.includes("Absence non justifiée sur 3 jours en octobre 2026."), String(parentPage.status));
  check("[P8 notif pages] repeated lateness: count, window and dates",
    /4 retards sur les 14 derniers jours \(du ⁦?06\/10\/2026⁩? au ⁦?19\/10\/2026⁩?\)/.test(parentPage.html));
  check("[P8 notif pages] a parent's alert opens the child's absences", parentPage.html.includes(`href="/fr/portal/absences?child=${kid.id}"`));
  const arPage = await get("/ar/portal/notifications", par1.cookies);
  check("[P8 notif pages] Arabic: month name in Arabic", arPage.html.includes("أكتوبر 2026"), String(arPage.status));
  const survPage = await get("/fr/notifications", survCookies);
  check("[P8 notif pages] staff: the alert opens the student's page",
    survPage.html.includes(`href="/fr/students/${kid.id}"`) && survPage.html.includes("5 jours en octobre 2026"), String(survPage.status));
  await admin.from("notifications").delete().in("id", daily.map((n) => n.id));
  await admin.from("students").delete().eq("id", kid.id);

  // --- Clean up ---------------------------------------------------------------------------------------------------
  await admin.from("notifications").delete().in("id", [a1, a2, a3, b1, b2]);
}
