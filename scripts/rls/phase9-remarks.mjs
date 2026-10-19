// Phase 9 step 3: student remarks. Who may write (attendance.manage = any
// student enrolled this year; a teacher = students of classes they teach this
// year), who is told (each parent account at once), who reads, "Lu" by a
// parent, the author's 24 hours to edit / delete, moderation by the director /
// attendance.manage with the audit row the database writes itself, the
// messaging module, and school B seeing nothing.
import { randomBytes } from "node:crypto";

import { check, denied, rows } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

export async function phase9Remarks({ fx, as }) {
  const A = fx.schools.a;
  const { dirA, survA, tchA, audA, dirB, anon } = as;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase9Remarks setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (query, what) => must(await query.select("id").single(), what).id;
  const label = (s) => `[P9 remarks] ${s}`;
  const refused = async (name, query, wanted) => {
    const { error } = await query;
    const pass = Boolean(error) && (error.code === wanted || error.message?.includes(wanted));
    check(label(name), pass, error ? `${error.code} ${error.message}` : "ACCEPTED!");
  };
  const write = (client, student, type = "behavior", body = "Bavardages répétés.") =>
    client.from("student_remarks").insert({ school_id: A.id, student_id: student, type, body }).select("id").single();
  const told = async (remark) =>
    (await admin.from("notifications").select("recipient_id, read_at, data").eq("type", "remark").filter("data->>remark_id", "eq", remark)).data ?? [];
  const audit = async (remark) =>
    (await admin.from("audit_logs").select("action, actor_id, data").eq("entity", "student_remark").eq("entity_id", remark)).data ?? [];
  const row = async (remark) => (await admin.from("student_remarks").select("*").eq("id", remark).maybeSingle()).data;
  const age = (remark, hours) =>
    admin.from("student_remarks").update({ created_at: new Date(Date.now() - hours * 3_600_000).toISOString() }).eq("id", remark);

  const now = Date.now();
  const today = iso(now);

  // --- Accounts ----------------------------------------------------------------------------------
  const account = async (name, school, roleKey) => {
    const email = `rls-test+${fx.run}-${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), name).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({
      id: user.id, school_id: school.id, role_id: school.roles[roleKey], full_name: `RLS ${name}`,
      email: roleKey === "parent" ? null : email, must_change_password: false,
    }), name);
    return { id: user.id, client: await signIn({ email, password }) };
  };
  const tch = fx.users.tchA.id;
  const { data: tchState } = await admin.from("profiles").select("must_change_password, deactivated_at").eq("id", tch).single();
  await admin.from("profiles").update({ must_change_password: false, deactivated_at: null }).eq("id", tch);
  const tch2 = await account("p9rtch2", A, "teacher");

  // --- School A: current year, two classes, the teacher teaches only c1 ----------------------------
  const { data: before } = await admin.from("academic_years").select("id").eq("school_id", A.id).eq("is_current", true).maybeSingle();
  const { data: existing } = await admin.from("academic_years").select("id")
    .eq("school_id", A.id).lte("start_date", today).gte("end_date", today).maybeSingle();
  const ownYear = !existing;
  const year = existing?.id ?? await id(admin.from("academic_years").insert({
    school_id: A.id, label: "P9r-annee", start_date: iso(now - 60 * DAY), end_date: iso(now + 200 * DAY), is_current: false,
  }), "year");
  must(await admin.from("academic_years").update({ is_current: true }).eq("id", year), "current year");
  const { data: monday } = await admin.from("school_days").select("day_of_week").eq("academic_year_id", year).eq("day_of_week", 1).maybeSingle();
  if (!monday) must(await admin.from("school_days").insert({ school_id: A.id, academic_year_id: year, day_of_week: 1 }), "day");
  const slot = await id(admin.from("time_slots").insert({
    school_id: A.id, academic_year_id: year, day_of_week: 1, start_time: "22:00", end_time: "22:20", kind: "lesson",
  }), "slot");
  const level = await id(admin.from("levels").insert({ school_id: A.id, name: "P9r-Niveau", cycle: "college" }), "level");
  const c1 = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: "P9r-1A" }), "c1");
  const c2 = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: "P9r-1B" }), "c2");
  const subject = await id(admin.from("subjects").insert({ school_id: A.id, name: "P9r-Maths" }), "subject");
  must(await dirA.from("teacher_subjects").insert({ school_id: A.id, teacher_id: tch, subject_id: subject }), "teaches");
  const lesson = await id(admin.from("lessons").insert({
    school_id: A.id, academic_year_id: year, time_slot_id: slot, class_id: c1, subject_id: subject, teacher_id: tch,
  }), "lesson");

  const students = [];
  const guardians = [];
  const kid = async (name, klass) => {
    const s = await id(admin.from("students").insert({ school_id: A.id, first_name: "Kid", last_name: name, birth_date: "2014-01-01", gender: "male" }), name);
    students.push(s);
    if (klass) must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: s, academic_year_id: year, class_id: klass }), "enrol");
    return s;
  };
  const parentOf = async (name, student, relation) => {
    const par = await account(name, A, "parent");
    const g = await id(admin.from("guardians").insert({ school_id: A.id, last_name: name, first_name: "Parent", phone: randomMobile(), profile_id: par.id }), "guardian");
    guardians.push(g);
    must(await admin.from("student_guardians").insert({ school_id: A.id, student_id: student, guardian_id: g, relation }), "link");
    return par;
  };
  const s1 = await kid("p9rkid1", c1);
  const s2 = await kid("p9rkid2", c2);
  const sNone = await kid("p9rkid3", null); // not enrolled this year
  const father = await parentOf("p9rfather", s1, "father");
  const mother = await parentOf("p9rmother", s1, "mother");
  const p2 = await parentOf("p9rpar2", s2, "father");

  try {
    // --- 1. Writing --------------------------------------------------------------------------------------
    const { data: r1, error: e1 } = await write(tchA, s1);
    check(label("a teacher writes a remark on a student of a class they teach"), !e1 && Boolean(r1), e1 ? `${e1.code} ${e1.message}` : "");
    const remark1 = r1?.id;
    const t1 = (await told(remark1)).map((n) => n.recipient_id);
    check(label("…both parent accounts are told at once, nobody else"), t1.length === 2 && t1.includes(father.id) && t1.includes(mother.id), `${t1.length} told`);
    check(label("…the notification carries the remark and its type"), (await told(remark1)).every((n) => n.data.remark_type === "behavior"));
    const r1row = await row(remark1);
    check(label("…author, year and student set; unread"), r1row.created_by === tch && r1row.academic_year_id === year && !r1row.read_at);

    await refused("a teacher cannot write on a student of a class they do not teach", write(tchA, s2), "42501");
    await refused("another teacher (no lesson) cannot write on class 1A", write(tch2.client, s1), "42501");
    const { data: r2, error: e2 } = await write(survA, s2, "praise", "Très bon travail ce trimestre.");
    check(label("the surveillant (attendance.manage) writes on any enrolled student"), !e2, e2 ? `${e2.code} ${e2.message}` : "");
    const remark2 = r2?.id;
    await refused("a student not enrolled this year", write(survA, sNone), "remark_student_not_enrolled");
    await refused("staff without attendance.manage cannot write", write(audA, s1), "42501");
    await refused("a parent cannot write", write(father.client, s1), "42501");
    await refused("anon cannot write", write(anon, s1), "42501");
    await refused("an unknown type", write(survA, s1, "insolence"), "23514");
    await refused("a text over 500 characters", write(survA, s1, "behavior", "x".repeat(501)), "23514");
    await refused("an empty text", write(survA, s1, "behavior", "   "), "23514");
    await refused("the author cannot be chosen",
      survA.from("student_remarks").insert({ school_id: A.id, student_id: s1, type: "praise", body: "x", created_by: tch }), "42501");

    // --- 2. Reading ----------------------------------------------------------------------------------------
    const both = [remark1, remark2];
    await rows(label("the director reads every remark"), dirA.from("student_remarks").select("id").in("id", both), 2);
    await rows(label("the surveillant reads every remark"), survA.from("student_remarks").select("id").in("id", both), 2);
    await rows(label("the teacher reads their class's remark, not class 1B's"), tchA.from("student_remarks").select("id").in("id", both), (l) => l.length === 1 && l[0].id === remark1);
    await rows(label("another teacher reads none"), tch2.client.from("student_remarks").select("id").in("id", both), 0);
    await rows(label("staff without the permission read none"), audA.from("student_remarks").select("id").in("id", both), 0);
    await rows(label("the father reads his child's remark only"), father.client.from("student_remarks").select("id").in("id", both), (l) => l.length === 1 && l[0].id === remark1);
    await rows(label("class 1B's parent reads only theirs"), p2.client.from("student_remarks").select("id").in("id", both), (l) => l.length === 1 && l[0].id === remark2);
    const anonRead = await anon.from("student_remarks").select("id").in("id", both);
    check(label("anon reads nothing (no grant)"), Boolean(anonRead.error) || anonRead.data.length === 0);

    // --- 3. "Lu" -----------------------------------------------------------------------------------------------
    await rows(label("the mother marks it read"), mother.client.from("student_remarks").update({ read_at: new Date().toISOString() }).eq("id", remark1).select("id"), 1);
    const readRow = await row(remark1);
    check(label("…read by the mother, time from the database"), readRow.read_by === mother.id && Boolean(readRow.read_at));
    await mother.client.from("student_remarks").update({ read_at: null }).eq("id", remark1);
    await father.client.from("student_remarks").update({ read_at: new Date(Date.now() + DAY).toISOString() }).eq("id", remark1);
    const reread = await row(remark1);
    check(label("…it stays read, first reader and time kept"), reread.read_by === mother.id && reread.read_at === readRow.read_at);
    await refused("a parent cannot change the text", father.client.from("student_remarks").update({ body: "Rien à signaler." }).eq("id", remark1), "remark_locked");
    await denied(label("another child's parent cannot mark it read"), p2.client.from("student_remarks").update({ read_at: new Date().toISOString() }).eq("id", remark1).select("id"));
    await refused("the author cannot mark it read", tchA.from("student_remarks").update({ read_at: new Date().toISOString() }).eq("id", remark1), "remark_read_parent_only");

    // --- 4. The author edits within 24 h ----------------------------------------------------------------------
    await rows(label("the author changes type and text within 24 h"),
      tchA.from("student_remarks").update({ type: "homework", body: "Exercices non faits." }).eq("id", remark1).select("id"), 1);
    const edited = await row(remark1);
    check(label("…unread again, updated_at set"), !edited.read_at && !edited.read_by && Boolean(edited.updated_at));
    check(label("…the parents' notifications show the new type, unread"), (await told(remark1)).every((n) => n.data.remark_type === "homework" && !n.read_at));
    await denied(label("the director cannot change a teacher's text"), dirA.from("student_remarks").update({ body: "Modifié." }).eq("id", remark1).select("id"));
    await denied(label("another teacher cannot change it"), tch2.client.from("student_remarks").update({ body: "Modifié." }).eq("id", remark1).select("id"));
    must(await age(remark1, 25), "age");
    await denied(label("the author cannot change it after 24 h"), tchA.from("student_remarks").update({ body: "Trop tard." }).eq("id", remark1).select("id"));

    // --- 5. Delete: author 24 h, moderation any time, logged by the database ------------------------------------
    await denied(label("the author cannot delete it after 24 h"), tchA.from("student_remarks").delete().eq("id", remark1).select("id"));
    await denied(label("another teacher cannot moderate"), tch2.client.from("student_remarks").delete().eq("id", remark1).select("id"));
    await denied(label("a parent cannot delete"), father.client.from("student_remarks").delete().eq("id", remark1).select("id"));
    await denied(label("staff without the permission cannot delete"), audA.from("student_remarks").delete().eq("id", remark1).select("id"));
    check(label("…nothing logged for refused deletes"), (await audit(remark1)).length === 0);
    await rows(label("the director deletes the teacher's remark after 24 h (moderation)"), dirA.from("student_remarks").delete().eq("id", remark1).select("id"), 1);
    const modLog = await audit(remark1);
    check(label("…logged as remark.moderate by the director, with the remark as it was"),
      modLog.length === 1 && modLog[0].action === "remark.moderate" && modLog[0].actor_id === fx.users.dirA.id
        && modLog[0].data.body === "Exercices non faits." && modLog[0].data.author_id === tch && modLog[0].data.type === "homework",
      JSON.stringify(modLog));
    check(label("…its notifications are gone"), (await told(remark1)).length === 0);

    const { data: r3 } = await write(tchA, s1, "material", "Pas de cahier.");
    await rows(label("the author deletes their own remark within 24 h"), tchA.from("student_remarks").delete().eq("id", r3.id).select("id"), 1);
    const ownLog = await audit(r3.id);
    check(label("…logged as remark.delete by the author"), ownLog.length === 1 && ownLog[0].action === "remark.delete" && ownLog[0].actor_id === tch, JSON.stringify(ownLog));

    const { data: r4 } = await write(tchA, s1, "behavior", "Retard en classe.");
    must(await age(r4.id, 48), "age");
    await rows(label("the surveillant (attendance.manage) moderates too"), survA.from("student_remarks").delete().eq("id", r4.id).select("id"), 1);
    check(label("…logged as remark.moderate by the surveillant"), (await audit(r4.id))[0]?.actor_id === fx.users.survA.id);

    // Deleting the student removes the remark and logs nothing.
    const sGone = await kid("p9rkid4", c2);
    const { data: r5 } = await write(survA, sGone, "praise", "Bravo.");
    must(await admin.from("students").delete().eq("id", sGone), "delete student");
    check(label("deleting the student removes the remark and logs nothing"), (await row(r5.id)) === null && (await audit(r5.id)).length === 0);

    // --- 6. School B -----------------------------------------------------------------------------------------------
    await rows(label("B's director reads none of A's remarks"), dirB.from("student_remarks").select("id").eq("school_id", A.id), 0);
    await refused("B's director cannot write on A's student", dirB.from("student_remarks").insert({ school_id: A.id, student_id: s1, type: "praise", body: "x" }), "42501");
    await denied(label("B's director cannot delete A's remark"), dirB.from("student_remarks").delete().eq("id", remark2).select("id"));

    // --- 7. Messaging module off -----------------------------------------------------------------------------------
    must(await admin.from("school_modules").upsert({ school_id: A.id, module_key: "messaging", enabled: false }, { onConflict: "school_id,module_key" }), "messaging off");
    await rows(label("module off: the director reads nothing"), dirA.from("student_remarks").select("id").eq("id", remark2), 0);
    await rows(label("module off: the parent reads nothing"), p2.client.from("student_remarks").select("id").eq("id", remark2), 0);
    await refused("module off: the surveillant cannot write", write(survA, s2), "42501");
    await admin.from("school_modules").delete().eq("school_id", A.id).eq("module_key", "messaging");
    await rows(label("module back on: the parent reads again"), p2.client.from("student_remarks").select("id").eq("id", remark2), 1);
  } finally {
    // --- Clean up (remarks of deleted students log nothing; delete the students first) -------------------------------
    await admin.from("student_guardians").delete().in("student_id", students);
    await admin.from("guardians").delete().in("id", guardians);
    await admin.from("students").delete().in("id", students);
    await admin.from("notifications").delete().eq("school_id", A.id).eq("type", "remark");
    await admin.from("lessons").delete().eq("id", lesson);
    await admin.from("teacher_subjects").delete().eq("subject_id", subject);
    await admin.from("classes").delete().in("id", [c1, c2]);
    await admin.from("time_slots").delete().eq("id", slot);
    if (!monday) await admin.from("school_days").delete().eq("academic_year_id", year).eq("day_of_week", 1);
    await admin.from("levels").delete().eq("id", level);
    await admin.from("subjects").delete().eq("id", subject);
    if (before && before.id !== year) await admin.from("academic_years").update({ is_current: true }).eq("id", before.id);
    else if (!before) await admin.from("academic_years").update({ is_current: false }).eq("id", year);
    if (ownYear) await admin.from("academic_years").delete().eq("id", year);
    await admin.from("profiles").update({ must_change_password: tchState.must_change_password, deactivated_at: tchState.deactivated_at }).eq("id", tch);
  }
}
