// Phase 10 step 5: the parent's switches. Only a parent of an active school saves
// them (save_push_preferences: own account and school from the session); nobody
// writes the table directly; a parent reads only their own row; no row = all on.
// A kind switched off is not queued for a push (the notification itself is still
// written); the other kinds still are; the demo reset clears the switches.
import { randomBytes } from "node:crypto";

import { check } from "./checks.mjs";
import { ensureDemoSchool } from "./demo-fixture.mjs";
import { admin, signIn } from "./fixtures.mjs";

export async function phase10PushPreferences({ fx, as }) {
  const A = fx.schools.a;
  const label = (s) => `[P10 prefs] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase10PushPreferences setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const code = async (query) => (await query).error?.code ?? "none";
  const account = async (name) => {
    const email = `rls-test+${fx.run}-${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), name).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({ id: user.id, school_id: A.id, role_id: A.roles.parent, full_name: `RLS ${name}`, must_change_password: false }), name);
    return { id: user.id, client: await signIn({ email, password }) };
  };
  const save = (client, absences, remarks, announcements) =>
    client.rpc("save_push_preferences", { p_absences: absences, p_remarks: remarks, p_announcements: announcements });
  const own = async (client) => must(await client.from("push_preferences").select("profile_id, school_id, absences, remarks, announcements"), "read");

  const par = await account("p10prefp");
  const other = await account("p10prefo");
  const phone = `https://push.example.com/rls-${fx.run}/${randomBytes(8).toString("hex")}`;
  must(await par.client.rpc("save_push_subscription", { p_endpoint: phone, p_p256dh: "BKeyPref", p_auth: "authPref", p_user_agent: "RLS" }), "phone");
  const student = must(
    await admin.from("students").insert({ school_id: A.id, first_name: "Pref", last_name: `Kid ${fx.run}`, birth_date: "2014-01-01", gender: "male" }).select("id").single(),
    "student",
  );
  const notes = [];
  const notify = async (type) => {
    const id = must(
      await admin.from("notifications").insert({ school_id: A.id, recipient_id: par.id, type, data: { test: true }, student_id: type === "announcement" ? null : student.id }).select("id").single(),
      type,
    ).id;
    notes.push(id);
    return id;
  };
  const queued = async (id) => must(await admin.from("push_outbox").select("id").eq("notification_id", id), "outbox").length === 1;

  try {
    // --- Saving --------------------------------------------------------------------------------------------
    check(label("no row yet: nothing saved"), (await own(par.client)).length === 0);
    check(label("…and every kind is pushed (no row = all on)"), await queued(await notify("announcement")));
    check(label("a parent saves their switches"), (await code(save(par.client, true, true, false))) === "none");
    const row = (await own(par.client))[0];
    check(label("…on their own account and school"), row?.profile_id === par.id && row.school_id === A.id && row.announcements === false && row.absences && row.remarks);
    check(label("saving again changes the same row"), (await code(save(par.client, false, true, false))) === "none" && (await own(par.client)).length === 1 && (await own(par.client))[0].absences === false);
    check(label("a missing value is refused"), (await code(save(par.client, null, true, true))) === "22004");

    for (const [who, client] of [["a director", as.dirA], ["a teacher", as.tchA]]) {
      check(label(`${who} cannot save switches`), (await code(save(client, true, true, true))) === "42501");
    }
    check(label("a signed-out visitor cannot save switches"), (await code(save(as.anon, true, true, true))) !== "none");
    check(label("no direct insert"), (await code(par.client.from("push_preferences").insert({ profile_id: par.id, school_id: A.id }))) === "42501");
    check(label("no direct update"), (await code(par.client.from("push_preferences").update({ remarks: false }).eq("profile_id", par.id))) === "42501");
    check(label("another parent reads nothing of it"), (await own(other.client)).length === 0);
    check(label("the director reads nothing of it"), ((await as.dirA.from("push_preferences").select("profile_id")).data ?? []).length === 0);

    // --- What is queued (absences off, remarks on, announcements off) --------------------------------------
    for (const type of ["absence", "absence_corrected", "unjustified_absences", "repeated_lateness"]) {
      check(label(`absences off: ${type} not queued`), !(await queued(await notify(type))));
    }
    check(label("remarks on: a remark is queued"), await queued(await notify("remark")));
    check(label("announcements off: an announcement is not queued"), !(await queued(await notify("announcement"))));
    check(label("…but the notification itself is written"), must(await admin.from("notifications").select("id").in("id", notes), "notes").length === notes.length);
    must(await save(par.client, true, false, true), "flip");
    check(label("switched back on: an absence is queued again"), await queued(await notify("absence")));
    check(label("switched off: a remark is no longer queued"), !(await queued(await notify("remark"))));

    // --- Demo school -----------------------------------------------------------------------------------------
    const demo = await ensureDemoSchool(fx);
    must(await admin.from("push_preferences").insert({ profile_id: demo.users.demoParent.id, school_id: demo.id, remarks: false }), "demo row");
    must(await admin.rpc("run_demo_reset", { p_school: demo.id }), "demo reset");
    check(label("the demo reset clears the demo school's switches"), must(await admin.from("push_preferences").select("profile_id").eq("school_id", demo.id), "demo").length === 0);
  } finally {
    await admin.from("notifications").delete().in("id", notes);
    await admin.from("push_subscriptions").delete().eq("endpoint", phone);
    await admin.from("students").delete().eq("id", student.id);
  }
}
