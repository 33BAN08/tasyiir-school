// Phase 9 closing pass: school B posts announcements (to a class's parents,
// to its staff), its teacher writes a remark on a student, and its director
// sets the contact card, while a parent, a teacher, a surveillant and the
// director of school A listen on Realtime. They receive none of it, read none
// of it through the API (announcements, targets, remarks, contact card,
// notifications), and cannot change, delete, mark read or moderate any of it,
// nor post into B. B's own parent and staff do receive theirs (control).
import { randomBytes } from "node:crypto";

import { check, denied, rows } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

export async function phase9CrossSchool({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const label = (s) => `[P9 cross-school] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase9CrossSchool setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (query, what) => must(await query.select("id").single(), what).id;
  const now = Date.now();
  const today = iso(now);

  const account = async (name, school, roleId) => {
    const email = `rls-test+${fx.run}-${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), name).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({ id: user.id, school_id: school.id, role_id: roleId, full_name: `RLS ${name}`, must_change_password: false }), name);
    return { id: user.id, client: await signIn({ email, password }) };
  };

  // --- School B: a CURRENT year, a class taught by B's teacher, a student with a parent account --------
  const { data: previousCurrent } = await admin.from("academic_years").select("id").eq("school_id", B.id).eq("is_current", true).maybeSingle();
  const { data: existing } = await admin.from("academic_years").select("id").eq("school_id", B.id)
    .lte("start_date", today).gte("end_date", today).maybeSingle();
  const ownYear = !existing;
  const year = existing?.id ?? await id(admin.from("academic_years").insert({
    school_id: B.id, label: "X9-annee", start_date: iso(now - 60 * DAY), end_date: iso(now + 200 * DAY), is_current: false,
  }), "year");
  must(await admin.from("academic_years").update({ is_current: true }).eq("id", year), "current year");
  const { data: monday } = await admin.from("school_days").select("day_of_week").eq("academic_year_id", year).eq("day_of_week", 1).maybeSingle();
  if (!monday) must(await admin.from("school_days").insert({ school_id: B.id, academic_year_id: year, day_of_week: 1 }), "day");
  const slot = await id(admin.from("time_slots").insert({
    school_id: B.id, academic_year_id: year, day_of_week: 1, start_time: "22:30", end_time: "22:50", kind: "lesson",
  }), "slot");
  const level = await id(admin.from("levels").insert({ school_id: B.id, name: "X9-Niveau", cycle: "college" }), "level");
  const klass = await id(admin.from("classes").insert({ school_id: B.id, academic_year_id: year, level_id: level, name: "X9-1" }), "class");
  const subject = await id(admin.from("subjects").insert({ school_id: B.id, name: "X9-SVT" }), "subject");
  const tchB = await account("x9tchb", B, B.roles.teacher);
  must(await as.dirB.from("teacher_subjects").insert({ school_id: B.id, teacher_id: tchB.id, subject_id: subject }), "teaches");
  const lesson = await id(admin.from("lessons").insert({
    school_id: B.id, academic_year_id: year, time_slot_id: slot, class_id: klass, subject_id: subject, teacher_id: tchB.id,
  }), "lesson");
  const kidB = await id(admin.from("students").insert({ school_id: B.id, first_name: "Kid", last_name: "X9B", birth_date: "2014-01-01", gender: "male" }), "kid");
  must(await admin.from("student_enrollments").insert({ school_id: B.id, student_id: kidB, academic_year_id: year, class_id: klass }), "enrol");
  const parB = await account("x9parb", B, B.roles.parent);
  const guardian = await id(admin.from("guardians").insert({ school_id: B.id, last_name: "X9B", first_name: "Parent", phone: randomMobile(), profile_id: parB.id }), "guardian");
  must(await admin.from("student_guardians").insert({ school_id: B.id, student_id: kidB, guardian_id: guardian, relation: "father" }), "link");

  // --- Observers in school A ------------------------------------------------------------------------
  const parA = await account("x9para", A, A.roles.parent);
  const observers = [
    ["a parent of A", parA.client], ["a teacher of A", as.tchA], ["a surveillant of A", as.survA], ["the director of A", as.dirA],
  ];

  // --- Everyone listens --------------------------------------------------------------------------------
  const listen = (client, bucket) =>
    new Promise((resolve) => {
      const channel = client.channel(`x9-${randomBytes(4).toString("hex")}`)
        .on("system", {}, (m) => { if (m.extension === "postgres_changes" && m.status === "ok") resolve(channel); })
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, (m) => bucket.push(m.new ?? m.old));
      channel.subscribe((status) => { if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") resolve(null); });
      setTimeout(() => resolve(null), 10_000);
    });
  const heard = new Map();
  const channels = [];
  for (const [who, client] of [...observers, ["B's parent", parB.client], ["B's teacher", tchB.client]]) {
    heard.set(who, []);
    channels.push(await listen(client, heard.get(who)));
  }
  check(label("everyone is subscribed to Realtime"), channels.every(Boolean), `${channels.filter(Boolean).length}/${channels.length}`);

  // --- B: two announcements, a remark, the contact card ----------------------------------------------
  const post = (scope, audience, classes = []) =>
    as.dirB.rpc("create_announcement", {
      p_scope: scope, p_audience: audience, p_title: `X9 ${audience}`, p_body: "Annonce de B.", p_level_ids: [], p_class_ids: classes,
    });
  const toParents = must(await post("classes", "parents", [klass]), "B class announcement");
  const toStaff = must(await post("school", "staff"), "B staff announcement");
  const announcements = [toParents, toStaff];
  const remark = must(await tchB.client.from("student_remarks")
    .insert({ school_id: B.id, student_id: kidB, type: "praise", body: "Excellent travail." }).select("id").single(), "B remark").id;
  const { data: contactBefore } = await admin.from("school_contacts").select("phone, whatsapp").eq("school_id", B.id).single();
  must(await as.dirB.from("school_contacts").update({ phone: "+212522111222", whatsapp: "+212611222333" }).eq("school_id", B.id), "B contact");

  for (let i = 0; i < 40 && (heard.get("B's parent").length < 2 || heard.get("B's teacher").length < 1); i++) {
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((r) => setTimeout(r, 1500)); // time for a wrongly delivered event to arrive

  // Control: B's own people get theirs.
  const types = (who) => heard.get(who).map((n) => n.type).sort().join();
  check(label("control: B's parent is sent the class announcement and the remark"), types("B's parent") === "announcement,remark", types("B's parent"));
  check(label("control: B's teacher is sent the staff announcement"), types("B's teacher") === "announcement", types("B's teacher"));

  // --- A's people: nothing of B, by Realtime or the API -----------------------------------------------
  const { data: bNotes } = await admin.from("notifications").select("id").eq("school_id", B.id).in("type", ["announcement", "remark"]);
  check(label("B holds its announcement + remark notifications"), bNotes.length >= 3, `${bNotes.length} row(s)`);
  const noteIds = bNotes.map((n) => n.id);
  const isB = (n) => n?.school_id === B.id || n?.student_id === kidB;
  const refusedOrNone = async (name, query) => {
    const { data, error } = await query;
    check(label(name), Boolean(error) || (Array.isArray(data) ? data.length === 0 : !data), error?.code ?? `${data?.length ?? 1} row(s)`);
  };

  for (const [who, client] of observers) {
    check(label(`${who}: no Realtime event about B`), heard.get(who).filter(isB).length === 0, `${heard.get(who).filter(isB).length} event(s)`);
    await rows(label(`${who}: reads none of B's notifications`), client.from("notifications").select("id").in("id", noteIds), 0);
    await denied(label(`${who}: cannot mark B's notifications read`),
      client.from("notifications").update({ read_at: new Date().toISOString() }).in("id", noteIds).select("id"));

    await rows(label(`${who}: reads none of B's announcements`), client.from("announcements").select("id").in("id", announcements), 0);
    await rows(label(`${who}: reads none of their targets`), client.from("announcement_targets").select("announcement_id").in("announcement_id", announcements), 0);
    await denied(label(`${who}: cannot edit B's announcement`),
      client.from("announcements").update({ title: "Piraté" }).in("id", announcements).select("id"));
    await denied(label(`${who}: cannot delete B's announcement`), client.from("announcements").delete().in("id", announcements).select("id"));
    await refusedOrNone(`${who}: cannot add a target to B's announcement`,
      client.from("announcement_targets").insert({ announcement_id: toParents, school_id: B.id, class_id: klass }).select("announcement_id"));
    await refusedOrNone(`${who}: cannot post into B`,
      client.from("announcements").insert({ school_id: B.id, scope: "school", audience: "parents", title: "x", body: "y" }).select("id"));
    await refusedOrNone(`${who}: cannot post to B's class`,
      client.rpc("create_announcement", { p_scope: "classes", p_audience: "parents", p_title: "x", p_body: "y", p_level_ids: [], p_class_ids: [klass] }));

    await rows(label(`${who}: reads none of B's remarks`), client.from("student_remarks").select("id").eq("school_id", B.id), 0);
    await denied(label(`${who}: cannot edit B's remark`), client.from("student_remarks").update({ body: "Piraté" }).eq("id", remark).select("id"));
    await denied(label(`${who}: cannot mark B's remark read`),
      client.from("student_remarks").update({ read_at: new Date().toISOString() }).eq("id", remark).select("id"));
    await denied(label(`${who}: cannot delete (moderate) B's remark`), client.from("student_remarks").delete().eq("id", remark).select("id"));
    await refusedOrNone(`${who}: cannot write a remark on B's student`,
      client.from("student_remarks").insert({ school_id: B.id, student_id: kidB, type: "behavior", body: "x" }).select("id"));

    await rows(label(`${who}: reads none of B's contact card`), client.from("school_contacts").select("school_id").eq("school_id", B.id), 0);
    await denied(label(`${who}: cannot change B's contact card`),
      client.from("school_contacts").update({ whatsapp: "+212699999999" }).eq("school_id", B.id).select("school_id"));
  }

  // B's data is as B left it.
  const { data: annAfter } = await admin.from("announcements").select("title").in("id", announcements);
  check(label("…B's announcements are intact"), annAfter.length === 2 && annAfter.every((a) => a.title.startsWith("X9")), JSON.stringify(annAfter));
  const { data: remarkAfter } = await admin.from("student_remarks").select("body, read_at").eq("id", remark).single();
  check(label("…B's remark is intact and unread"), remarkAfter?.body === "Excellent travail." && remarkAfter.read_at === null, JSON.stringify(remarkAfter));
  const { data: contactAfter } = await admin.from("school_contacts").select("whatsapp").eq("school_id", B.id).single();
  check(label("…B's contact card is intact"), contactAfter.whatsapp === "+212611222333");
  const { data: audits } = await admin.from("audit_logs").select("id").eq("school_id", B.id).in("action", ["remark.delete", "remark.moderate"]);
  check(label("…and no remark delete was logged in B"), audits.length === 0, `${audits.length} row(s)`);
  await rows(label("none of A's people was sent a notification at all"),
    admin.from("notifications").select("id").in("recipient_id", [parA.id, fx.users.tchA.id, fx.users.survA.id, fx.users.dirA.id]), 0);

  // --- Clean up ------------------------------------------------------------------------------------------
  for (const ch of channels) if (ch) await ch.unsubscribe();
  await admin.from("school_contacts").update(contactBefore).eq("school_id", B.id);
  await admin.from("announcements").delete().in("id", announcements);
  await admin.from("student_remarks").delete().eq("id", remark);
  await admin.from("notifications").delete().eq("school_id", B.id).in("type", ["announcement", "remark"]);
  await admin.from("audit_logs").delete().eq("school_id", B.id).in("action", ["remark.delete", "remark.moderate"]);
  await admin.from("student_guardians").delete().eq("student_id", kidB);
  await admin.from("guardians").delete().eq("id", guardian);
  await admin.from("students").delete().eq("id", kidB);
  await admin.from("lessons").delete().eq("id", lesson);
  await admin.from("teacher_subjects").delete().eq("subject_id", subject);
  await admin.from("classes").delete().eq("id", klass);
  await admin.from("time_slots").delete().eq("id", slot);
  if (!monday) await admin.from("school_days").delete().eq("academic_year_id", year).eq("day_of_week", 1);
  if (previousCurrent && previousCurrent.id !== year) await admin.from("academic_years").update({ is_current: true }).eq("id", previousCurrent.id);
  else if (!previousCurrent) await admin.from("academic_years").update({ is_current: false }).eq("id", year);
  if (ownYear) await admin.from("academic_years").delete().eq("id", year);
  await admin.from("levels").delete().eq("id", level);
  await admin.from("subjects").delete().eq("id", subject);
}
