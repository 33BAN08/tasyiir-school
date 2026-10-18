// Phase 7 step 1: attendance in the database. A session = a lesson on a date,
// with a snapshot of the lesson; marks = absent / late students only. The
// database refuses a wrong weekday, a date outside the year or in the future,
// a student of another class, a changed snapshot or a moved mark. Staff
// (attendance.manage) correct any day; a teacher only their own lessons, the
// SAME day (school's today, Africa/Casablanca, from the database). Parents
// read their own children's marks; other schools read nothing.
import { randomBytes } from "node:crypto";

import { allowed, check, denied, rows, skip } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const isoDow = (t) => ((new Date(t).getUTCDay() + 6) % 7) + 1; // Monday 1 … Sunday 7

export async function phase7Attendance({ fx, as }) {
  const A = fx.schools.a;
  const { dirA, survA, tchA, audA, dirB, owner } = as;
  const tch = fx.users.tchA.id;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase7Attendance setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (query, what) => must(await query.select("id").single(), what).id;
  const refused = async (label, query, wanted) => {
    const { error } = await query;
    const got = error ? (error.code === "P0001" ? error.message : error.code) : "ACCEPTED!";
    check(`[P7 attendance] ${label}`, got === wanted, error ? `${error.code} ${error.message}` : got);
  };

  // The school's today. Morocco is UTC+0 permanently since 2026-09-20, so it
  // is the UTC date (the database computes it with Africa/Casablanca).
  const now = Date.now();
  const today = iso(now);
  const todayDow = isoDow(now);
  let pastTime = now - DAY;
  while (isoDow(pastTime) === 7) pastTime -= DAY;
  const past = iso(pastTime);
  const pastDow = isoDow(pastTime);

  // --- Accounts: a second teacher, a parent (own password set) --------------------------------
  const account = async (roleKey, name) => {
    const email = `rls-test+${fx.run}-${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), `user ${name}`).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({
      id: user.id, school_id: A.id, role_id: A.roles[roleKey], full_name: `RLS ${name}`,
      email: roleKey === "parent" ? null : email, must_change_password: false,
    }), `profile ${name}`);
    return { id: user.id, client: await signIn({ email, password }) };
  };
  const tch2 = await account("teacher", "p7tch2");
  const parent = await account("parent", "p7par");
  // Earlier suites may leave the fixture teacher with a forced password change: not here.
  const { data: tchState } = await admin.from("profiles").select("must_change_password, deactivated_at").eq("id", tch).single();
  await admin.from("profiles").update({ must_change_password: false, deactivated_at: null }).eq("id", tch);

  // --- A year containing today (years never overlap: reuse the one an earlier suite left, else
  // create one), Monday–Saturday 21:00 (an hour no other suite uses), one class with lessons
  // every day. Only what this suite adds is removed at the end.
  const { data: existing } = await admin.from("academic_years").select("id, start_date, end_date")
    .eq("school_id", A.id).lte("start_date", past).gte("end_date", iso(pastTime + 7 * DAY)).maybeSingle();
  const ownYear = !existing;
  const year = existing?.id ?? await id(admin.from("academic_years").insert({
    school_id: A.id, label: "P7-annee", start_date: iso(now - 60 * DAY), end_date: iso(now + 200 * DAY), is_current: false,
  }), "year");
  const yearStart = Date.parse(`${existing?.start_date ?? iso(now - 60 * DAY)}T00:00:00Z`);
  const { data: daysBefore } = await admin.from("school_days").select("day_of_week").eq("academic_year_id", year);
  const addedDays = [1, 2, 3, 4, 5, 6].filter((d) => !(daysBefore ?? []).some((x) => x.day_of_week === d));
  if (addedDays.length) {
    must(await admin.from("school_days").insert(addedDays.map((day) => ({ school_id: A.id, academic_year_id: year, day_of_week: day }))), "days");
  }
  const slotOf = {};
  for (let day = 1; day <= 6; day++) {
    slotOf[day] = await id(admin.from("time_slots").insert({
      school_id: A.id, academic_year_id: year, day_of_week: day, start_time: "21:00", end_time: "21:30", kind: "lesson",
    }), "slot");
  }
  // A date with the past lesson's weekday, before the year starts.
  let outsideTime = yearStart - DAY;
  while (isoDow(outsideTime) !== pastDow) outsideTime -= DAY;
  const level = await id(admin.from("levels").insert({ school_id: A.id, name: "P7-Niveau", cycle: "college" }), "level");
  const c1 = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: "P7-1" }), "c1");
  const c2 = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: "P7-2" }), "c2");
  const arabe = await id(admin.from("subjects").insert({ school_id: A.id, name: "P7-Arabe" }), "subject");
  const dirAClient = await signIn(fx.users.dirA);
  must(await dirAClient.from("teacher_subjects").insert({ school_id: A.id, teacher_id: tch, subject_id: arabe }), "teaches");
  const lessonOf = {};
  for (let day = 1; day <= 6; day++) {
    lessonOf[day] = await id(admin.from("lessons").insert({
      school_id: A.id, academic_year_id: year, time_slot_id: slotOf[day], class_id: c1, subject_id: arabe, teacher_id: tch,
    }), "lesson");
  }
  const kid = (name, classId) => id(admin.from("students").insert({
    school_id: A.id, first_name: "Kid", last_name: name, birth_date: "2014-01-01", gender: "male",
  }), name).then(async (s) => {
    must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: s, academic_year_id: year, class_id: classId }), "enrol");
    return s;
  });
  const kid1 = await kid("P7K1", c1); // the parent's child
  const kid2 = await kid("P7K2", c1);
  const other = await kid("P7K3", c2); // another class
  const guardian = await id(admin.from("guardians").insert({ school_id: A.id, last_name: "P7", first_name: "Parent", phone: randomMobile(), profile_id: parent.id }), "guardian");
  must(await admin.from("student_guardians").insert({ school_id: A.id, student_id: kid1, guardian_id: guardian, relation: "father" }), "link");

  const save = (client, lesson, date, marks = []) =>
    client.rpc("save_attendance", { p_lesson: lesson, p_date: date, p_marks: marks });
  const marksOf = (client, session) => client.from("attendance_marks").select("student_id, status, minutes_late, marked_by, marked_at").eq("session_id", session);

  // --- Staff: a past day ----------------------------------------------------------------------
  const first = await save(survA, lessonOf[pastDow], past, [
    { student_id: kid1, status: "absent" },
    { student_id: kid2, status: "late", minutes_late: 10 },
  ]);
  check("[P7 attendance] surveillant takes attendance of a past day", !first.error && !!first.data, first.error?.message ?? "");
  const session = first.data;
  const { data: snap } = await admin.from("attendance_sessions").select("*").eq("id", session).single();
  check("[P7 attendance] …the session keeps a snapshot of the lesson (class, subject, teacher, hours, year)",
    snap?.class_id === c1 && snap?.subject_id === arabe && snap?.teacher_id === tch && snap?.start_time === "21:00:00"
      && snap?.end_time === "21:30:00" && snap?.academic_year_id === year && snap?.taken_by === fx.users.survA.id,
    JSON.stringify(snap));
  const before = (await marksOf(admin, session)).data ?? [];
  check("[P7 attendance] …two marks (absent, late 10 min), marked by the surveillant",
    before.length === 2 && before.every((m) => m.marked_by === fx.users.survA.id)
      && before.some((m) => m.student_id === kid2 && m.status === "late" && m.minutes_late === 10));

  const again = await save(dirA, lessonOf[pastDow], past, [{ student_id: kid2, status: "late", minutes_late: 10 }]);
  const after = (await marksOf(admin, session)).data ?? [];
  const kept = after.find((m) => m.student_id === kid2);
  const was = before.find((m) => m.student_id === kid2);
  check("[P7 attendance] director corrects it: same session, the student left out is present again",
    again.data === session && after.length === 1 && after[0].student_id === kid2, JSON.stringify(after));
  check("[P7 attendance] …an unchanged mark keeps who marked it and when",
    kept?.marked_by === was?.marked_by && kept?.marked_at === was?.marked_at);
  const { data: snap2 } = await admin.from("attendance_sessions").select("taken_by, updated_by").eq("id", session).single();
  check("[P7 attendance] …taken_by stays, updated_by is the director",
    snap2?.taken_by === fx.users.survA.id && snap2?.updated_by === fx.users.dirA.id, JSON.stringify(snap2));
  await allowed("[P7 attendance] late without minutes is fine",
    save(survA, lessonOf[pastDow], past, [{ student_id: kid2, status: "late" }]).then((r) => ({ ...r, data: r.data ? [r.data] : null })));

  // --- The database refuses -------------------------------------------------------------------
  await refused("a date in the future", save(survA, lessonOf[pastDow], iso(pastTime + 7 * DAY)), "attendance_future");
  await refused("a date that is not the lesson's weekday", save(survA, lessonOf[pastDow], iso(pastTime - DAY)), "attendance_wrong_day");
  await refused("a date outside the lesson's year", save(survA, lessonOf[pastDow], iso(outsideTime)), "attendance_outside_year");
  await refused("a student of another class", save(survA, lessonOf[pastDow], past, [{ student_id: other, status: "absent" }]), "23514");
  await refused("absent with minutes", save(survA, lessonOf[pastDow], past, [{ student_id: kid1, status: "absent", minutes_late: 5 }]), "23514");
  await refused("late over 240 minutes", save(survA, lessonOf[pastDow], past, [{ student_id: kid1, status: "late", minutes_late: 300 }]), "23514");
  await refused("an unknown status", save(survA, lessonOf[pastDow], past, [{ student_id: kid1, status: "present" }]), "23514");
  await refused("a note over 200 characters",
    save(survA, lessonOf[pastDow], past, [{ student_id: kid1, status: "absent", note: "x".repeat(201) }]), "23514");
  check("[P7 attendance] refused calls changed nothing (all or nothing)",
    ((await marksOf(admin, session)).data ?? []).length === 1);

  // Snapshot and marks are locked.
  await refused("changing a session's class (snapshot locked)",
    survA.from("attendance_sessions").update({ class_id: c2 }).eq("id", session), "attendance_session_locked");
  await refused("changing a session's date (snapshot locked)",
    survA.from("attendance_sessions").update({ session_date: iso(pastTime - 7 * DAY) }).eq("id", session), "attendance_session_locked");
  await refused("moving a mark to another student (mark locked)",
    survA.from("attendance_marks").update({ student_id: kid1 }).eq("session_id", session).eq("student_id", kid2), "attendance_mark_locked");
  const otherSession = (await save(survA, lessonOf[pastDow], iso(pastTime - 7 * DAY))).data;
  await refused("moving a mark to another session (mark locked)",
    survA.from("attendance_marks").update({ session_id: otherSession }).eq("session_id", session).eq("student_id", kid2), "attendance_mark_locked");
  await refused("moving a mark to another school (mark locked)",
    survA.from("attendance_marks").update({ school_id: fx.schools.b.id }).eq("session_id", session).eq("student_id", kid2), "attendance_mark_locked");
  await allowed("[P7 attendance] staff may still change a mark's status, minutes and note",
    survA.from("attendance_marks").update({ status: "late", minutes_late: 15, note: "Bus en retard" }).eq("session_id", session).eq("student_id", kid2).select("student_id"));

  // --- A teacher -------------------------------------------------------------------------------
  await rows("[P7 attendance] the teacher reads their own past session", tchA.from("attendance_sessions").select("id").eq("id", session), 1);
  await rows("[P7 attendance] …and its marks", marksOf(tchA, session), 1);
  await refused("the teacher cannot change a past day (same day only)",
    save(tchA, lessonOf[pastDow], past, []), "42501");
  await denied("[P7 attendance] …nor a past mark directly",
    tchA.from("attendance_marks").update({ status: "absent", minutes_late: null }).eq("session_id", session).select("student_id"));
  await denied("[P7 attendance] the teacher cannot delete a session", tchA.from("attendance_sessions").delete().eq("id", session).select("id"));
  await rows("[P7 attendance] another teacher reads nothing of it", tch2.client.from("attendance_sessions").select("id").eq("id", session), 0);
  await rows("[P7 attendance] …nor its marks", marksOf(tch2.client, session), 0);

  if (todayDow === 7) {
    for (const name of ["teacher takes attendance of their lesson today", "…and changes it the same day",
      "another teacher cannot take it", "the teacher still cannot delete it"]) {
      skip(`[P7 attendance] ${name}`, "today is Sunday (no lessons): runs Monday to Saturday");
    }
  } else {
    const todaySave = await save(tchA, lessonOf[todayDow], today, [{ student_id: kid1, status: "absent" }]);
    check("[P7 attendance] teacher takes attendance of their lesson today", !todaySave.error, todaySave.error?.message ?? "");
    const change = await save(tchA, lessonOf[todayDow], today, [{ student_id: kid1, status: "late", minutes_late: 5 }]);
    check("[P7 attendance] …and changes it the same day", !change.error && change.data === todaySave.data, change.error?.message ?? "");
    await refused("another teacher cannot take it", save(tch2.client, lessonOf[todayDow], today), "42501");
    await denied("[P7 attendance] the teacher still cannot delete it",
      tchA.from("attendance_sessions").delete().eq("id", todaySave.data).select("id"));
  }

  // --- Parents, other staff, other schools ----------------------------------------------------------
  await save(survA, lessonOf[pastDow], past, [{ student_id: kid1, status: "absent" }, { student_id: kid2, status: "late" }]);
  await rows("[P7 attendance] a parent reads their child's mark only", parent.client.from("attendance_marks").select("student_id"),
    (r) => r.length >= 1 && r.every((m) => m.student_id === kid1));
  await rows("[P7 attendance] …and the session of that mark", parent.client.from("attendance_sessions").select("id").eq("id", session), 1);
  await rows("[P7 attendance] …not a session where their child was present", parent.client.from("attendance_sessions").select("id").eq("id", otherSession), 0);
  await refused("a parent cannot take attendance", save(parent.client, lessonOf[pastDow], past, []), "42501");
  await rows("[P7 attendance] staff without attendance permission read nothing", audA.from("attendance_marks").select("student_id"), 0);
  await refused("…and cannot take attendance", save(audA, lessonOf[pastDow], past, []), "42501");
  await rows("[P7 attendance] another school's director reads nothing", dirB.from("attendance_sessions").select("id").eq("school_id", A.id), 0);
  await refused("…and cannot take attendance of school A's lesson", save(dirB, lessonOf[pastDow], past, []), "attendance_lesson_not_found");
  await rows("[P7 attendance] the platform owner reads nothing", owner.from("attendance_marks").select("student_id"), 0);

  // Module off → nothing for anyone.
  must(await admin.from("school_modules").insert({ school_id: A.id, module_key: "attendance", enabled: false }), "module off");
  await rows("[P7 attendance] module off: the surveillant reads nothing", survA.from("attendance_sessions").select("id"), 0);
  await refused("module off: no attendance can be taken", save(survA, lessonOf[pastDow], past, []), "42501");
  must(await admin.from("school_modules").delete().eq("school_id", A.id).eq("module_key", "attendance"), "module back");

  // --- Deletes ------------------------------------------------------------------------------------------
  const delSubject = await dirA.from("subjects").delete().eq("id", arabe).select("id");
  check("[P7 attendance] a subject with attendance history cannot be deleted",
    delSubject.error?.message?.includes("lessons_subject_fkey") || delSubject.error?.message?.includes("attendance_sessions_subject_fkey") || false,
    delSubject.error?.message ?? "deleted!");
  await admin.from("lessons").delete().eq("id", lessonOf[pastDow]);
  const { data: orphan } = await admin.from("attendance_sessions").select("lesson_id, class_id, subject_id").eq("id", session).single();
  check("[P7 attendance] deleting the lesson keeps its sessions (no link, same snapshot)",
    orphan?.lesson_id === null && orphan?.class_id === c1 && orphan?.subject_id === arabe, JSON.stringify(orphan));
  // No lesson uses the subject any more: only its attendance history does.
  await admin.from("lessons").delete().eq("subject_id", arabe);
  const delSubject2 = await dirA.from("subjects").delete().eq("id", arabe).select("id");
  check("[P7 attendance] …the subject is still kept by its attendance history",
    delSubject2.error?.message?.includes("attendance_sessions_subject_fkey") ?? false, delSubject2.error?.message ?? "deleted!");
  await admin.from("students").delete().eq("id", kid2);
  await rows("[P7 attendance] deleting a student deletes their marks", admin.from("attendance_marks").select("student_id").eq("student_id", kid2), 0);
  // A class with no student and no lesson left, but attendance history.
  await admin.from("student_enrollments").delete().eq("class_id", c1);
  await admin.from("lessons").delete().eq("class_id", c1);
  const delClass = await dirA.from("classes").delete().eq("id", c1).select("id");
  check("[P7 attendance] a class with attendance history cannot be deleted",
    delClass.error?.message?.includes("attendance_sessions_class_fkey") ?? false, delClass.error?.message ?? "deleted!");
  await allowed("[P7 attendance] the surveillant can delete a session", survA.from("attendance_sessions").delete().eq("id", otherSession).select("id"));

  // --- Clean up -----------------------------------------------------------------------------------------
  await admin.from("attendance_sessions").delete().in("class_id", [c1, c2]);
  await admin.from("student_guardians").delete().eq("guardian_id", guardian);
  await admin.from("guardians").delete().eq("id", guardian);
  await admin.from("student_enrollments").delete().in("student_id", [kid1, other]);
  await admin.from("students").delete().in("id", [kid1, other]);
  await admin.from("lessons").delete().in("class_id", [c1, c2]);
  await admin.from("teacher_subjects").delete().eq("subject_id", arabe);
  await admin.from("classes").delete().in("id", [c1, c2]);
  await admin.from("time_slots").delete().in("id", Object.values(slotOf));
  if (addedDays.length) await admin.from("school_days").delete().eq("academic_year_id", year).in("day_of_week", addedDays);
  if (ownYear) await admin.from("academic_years").delete().eq("id", year);
  await admin.from("levels").delete().eq("id", level);
  await admin.from("subjects").delete().eq("id", arabe);
  await admin.from("profiles").update(tchState).eq("id", tch);
}
