// Phase 6 closing pass: lessons RLS across schools for the two read-only
// audiences. A teacher and a parent of school B read their own school's
// lessons only — never school A's (lessons, teacher names, teacher subjects) —
// and can change nothing anywhere; school A's teacher reads nothing of B.
import { randomBytes } from "node:crypto";

import { check, denied, rows } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

export async function phase6CrossSchool({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const { tchA } = as;
  const tch = fx.users.tchA.id;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase6CrossSchool setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (query, what) => must(await query.select("id").single(), what).id;

  // --- Accounts in school B: a teacher, a parent (own password set) ---------------------------
  const account = async (school, roleKey, name) => {
    const email = `rls-test+${fx.run}-${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), `user ${name}`).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({
      id: user.id, school_id: school.id, role_id: school.roles[roleKey], full_name: `RLS ${name}`,
      email: roleKey === "parent" ? null : email, must_change_password: false,
    }), `profile ${name}`);
    return { id: user.id, client: await signIn({ email, password }) };
  };
  const tchB = await account(B, "teacher", "xstchb");
  const parB = await account(B, "parent", "xsparb");

  // --- One current year per school, one lesson each ------------------------------------------
  const currentOf = async (s) =>
    (await admin.from("academic_years").select("id").eq("school_id", s.id).eq("is_current", true).maybeSingle()).data?.id;
  const previous = [await currentOf(A), await currentOf(B)].filter(Boolean);
  const setUp = async (school, teacherId, tag, signedIn) => {
    const year = await id(admin.from("academic_years").insert({
      school_id: school.id, label: "2052-2053", start_date: "2052-09-01", end_date: "2053-06-30", is_current: true,
    }), `year ${tag}`);
    must(await admin.from("school_days").insert({ school_id: school.id, academic_year_id: year, day_of_week: 1 }), "day");
    const slot = await id(admin.from("time_slots").insert({
      school_id: school.id, academic_year_id: year, day_of_week: 1, start_time: "08:00", end_time: "09:00", kind: "lesson",
    }), "slot");
    const level = await id(admin.from("levels").insert({ school_id: school.id, name: `${tag}-Niveau`, cycle: "college" }), "level");
    const klass = await id(admin.from("classes").insert({ school_id: school.id, academic_year_id: year, level_id: level, name: `${tag}-1` }), "class");
    const subject = await id(admin.from("subjects").insert({ school_id: school.id, name: `${tag}-Arabe` }), "subject");
    must(await signedIn.from("teacher_subjects").insert({ school_id: school.id, teacher_id: teacherId, subject_id: subject }), "teaches");
    const lesson = await id(admin.from("lessons").insert({
      school_id: school.id, academic_year_id: year, time_slot_id: slot, class_id: klass, subject_id: subject, teacher_id: teacherId,
    }), "lesson");
    return { year, slot, level, klass, subject, lesson };
  };
  const a = await setUp(A, tch, "XA", await signIn(fx.users.dirA));
  const b = await setUp(B, tchB.id, "XB", await signIn(fx.users.dirB));

  // The parent of school B has a child in XB-1.
  const kid = await id(admin.from("students").insert({ school_id: B.id, first_name: "Kid", last_name: "XSB", birth_date: "2014-01-01", gender: "male" }), "kid");
  must(await admin.from("student_enrollments").insert({ school_id: B.id, student_id: kid, academic_year_id: b.year, class_id: b.klass }), "enrol");
  const guardian = await id(admin.from("guardians").insert({ school_id: B.id, last_name: "XSB", first_name: "Parent", phone: randomMobile(), profile_id: parB.id }), "guardian");
  must(await admin.from("student_guardians").insert({ school_id: B.id, student_id: kid, guardian_id: guardian, relation: "mother" }), "link");

  const lessonIds = (client) => client.from("lessons").select("id");
  const teacherNames = async (client, year) => ((await client.rpc("timetable_teachers", { p_year: year })).data ?? []).map((t) => t.id);

  // --- Reads ------------------------------------------------------------------------------------
  for (const [who, client] of [["teacher of school B", tchB.client], ["parent of school B", parB.client]]) {
    await rows(`[P6 cross-school] ${who} reads exactly their school's lesson`, lessonIds(client), (r) => r.length === 1 && r[0].id === b.lesson);
    await rows(`[P6 cross-school] ${who} cannot read school A's lesson by id`, client.from("lessons").select("id").eq("id", a.lesson), 0);
    await rows(`[P6 cross-school] ${who} cannot read school A's lessons by school`, client.from("lessons").select("id").eq("school_id", A.id), 0);
    check(`[P6 cross-school] ${who} gets no teacher name of school A`,
      !(await teacherNames(client, a.year)).includes(tch) && !(await teacherNames(client, null)).includes(tch));
    await rows(`[P6 cross-school] ${who} reads no teacher subject of school A`,
      client.from("teacher_subjects").select("teacher_id").eq("school_id", A.id), 0);
  }
  await rows("[P6 cross-school] school A's teacher reads nothing of school B", tchA.from("lessons").select("id").eq("school_id", B.id), 0);
  check("[P6 cross-school] school A's teacher gets no teacher name of school B", !(await teacherNames(tchA, b.year)).includes(tchB.id));

  // --- Writes: none, in either school -------------------------------------------------------------
  for (const [who, client] of [["teacher of school B", tchB.client], ["parent of school B", parB.client]]) {
    await denied(`[P6 cross-school] ${who} cannot add a lesson in school A`, client.from("lessons").insert({
      school_id: A.id, academic_year_id: a.year, time_slot_id: a.slot, class_id: a.klass, subject_id: a.subject, teacher_id: tch,
    }));
    await denied(`[P6 cross-school] ${who} cannot add a lesson in school B either`, client.from("lessons").insert({
      school_id: B.id, academic_year_id: b.year, time_slot_id: b.slot, class_id: b.klass, subject_id: b.subject, teacher_id: tchB.id,
    }));
    await rows(`[P6 cross-school] ${who} cannot change school A's lesson`, client.from("lessons").update({ room_id: null }).eq("id", a.lesson).select("id"), 0);
    await rows(`[P6 cross-school] ${who} cannot change their own school's lesson`, client.from("lessons").update({ room_id: null }).eq("id", b.lesson).select("id"), 0);
    await rows(`[P6 cross-school] ${who} cannot delete school A's lesson`, client.from("lessons").delete().eq("id", a.lesson).select("id"), 0);
    const copy = await client.rpc("copy_class_lessons", { p_from_class: a.klass, p_to_class: b.klass, p_apply: true });
    check(`[P6 cross-school] ${who} cannot copy a timetable`, copy.error?.code === "42501", copy.error?.code ?? "ACCEPTED!");
  }
  const left = await admin.from("lessons").select("id").in("id", [a.lesson, b.lesson]);
  check("[P6 cross-school] both lessons are untouched", left.data?.length === 2);

  // --- Clean up ------------------------------------------------------------------------------------
  await admin.from("student_guardians").delete().eq("guardian_id", guardian);
  await admin.from("guardians").delete().eq("id", guardian);
  await admin.from("student_enrollments").delete().eq("student_id", kid);
  await admin.from("students").delete().eq("id", kid);
  for (const x of [a, b]) {
    await admin.from("lessons").delete().eq("academic_year_id", x.year);
    await admin.from("teacher_subjects").delete().eq("subject_id", x.subject);
    await admin.from("classes").delete().eq("id", x.klass);
    await admin.from("academic_years").delete().eq("id", x.year);
    await admin.from("levels").delete().eq("id", x.level);
    await admin.from("subjects").delete().eq("id", x.subject);
  }
  for (const yearId of previous) await admin.from("academic_years").update({ is_current: true }).eq("id", yearId);
}
