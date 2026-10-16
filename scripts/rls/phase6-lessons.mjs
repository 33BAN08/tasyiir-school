// Phase 6 step 1: lessons (database level). The database refuses double
// bookings, breaks, a teacher who does not teach the subject, and anything
// from another school or year; swap_lessons() swaps two lessons atomically;
// timetable_teachers() gives names only; lessons block deleting what they use.
// Reads: timetable.view / .manage staff, a teacher their own lessons, a parent
// their children's classes. Writes: own school + timetable.manage + module on.
import { randomBytes } from "node:crypto";

import { allowed, check, denied, rows } from "./checks.mjs";
import { admin, anon, signIn } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

export async function phase6Lessons({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const { dirA, survA, tchA, audA, dirB, dirC, owner } = as;
  const tch = fx.users.tchA.id;

  const must = (r, what) => {
    if (r.error) throw new Error(`phase6Lessons setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (query, what) => must(await query.select("id").single(), what).id;
  const refusedWith = async (label, query, code) => {
    const { error } = await query;
    check(`[P6 lessons] ${label}`, error?.code === code, error ? `${error.code} ${error.message}` : "ACCEPTED!");
  };

  // --- Accounts: a second teacher in A, a teacher in B, two parents in A ------------------
  const account = async (school, roleKey, name) => {
    const email = `rls-test+${fx.run}-${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), `user ${name}`).user;
    fx.createdUserIds.push(user.id);
    must(
      await admin.from("profiles").insert({
        id: user.id, school_id: school.id, role_id: school.roles[roleKey], full_name: `RLS ${name}`,
        email: roleKey === "parent" ? null : email, must_change_password: false,
      }),
      `profile ${name}`,
    );
    return { id: user.id, client: await signIn({ email, password }) };
  };
  const tch2 = await account(A, "teacher", "tch2a");
  const tchB = await account(B, "teacher", "tchb");
  const par1 = await account(A, "parent", "p6par1");
  const par2 = await account(A, "parent", "p6par2");

  // --- Structure (admin) --------------------------------------------------------------------
  // Later suites expect the current years the earlier ones left: put them back at the end.
  const currentOf = async (s) =>
    (await admin.from("academic_years").select("id").eq("school_id", s.id).eq("is_current", true).maybeSingle()).data?.id;
  const previousCurrent = [await currentOf(A), await currentOf(B)].filter(Boolean);
  const year =(school, y, current) =>
    id(admin.from("academic_years").insert({
      school_id: school.id, label: `${y}-${y + 1}`, start_date: `${y}-09-01`, end_date: `${y + 1}-06-30`, is_current: current,
    }), `year ${y}`);
  const y0 = await year(A, 2059, false);
  const y1 = await year(A, 2060, true);
  const yB = await year(B, 2060, true);
  for (const [s, y] of [[A, y0], [A, y1], [B, yB]]) {
    must(await admin.from("school_days").insert({ school_id: s.id, academic_year_id: y, day_of_week: 1 }), "day");
  }
  const slot = (s, y, start, end, kind = "lesson") =>
    id(admin.from("time_slots").insert({ school_id: s.id, academic_year_id: y, day_of_week: 1, start_time: start, end_time: end, kind }), "slot");
  const s1 = await slot(A, y1, "08:00", "09:00");
  const s2 = await slot(A, y1, "09:00", "10:00");
  const s3 = await slot(A, y1, "10:15", "11:15");
  const brk = await slot(A, y1, "10:00", "10:15", "break");
  const p1 = await slot(A, y0, "08:00", "09:00");
  const sB = await slot(B, yB, "08:00", "09:00");

  const levelA = await id(admin.from("levels").insert({ school_id: A.id, name: "P6-1AC", cycle: "college" }), "level A");
  const levelB = await id(admin.from("levels").insert({ school_id: B.id, name: "P6-1AC", cycle: "college" }), "level B");
  const klass = (s, y, level, name) =>
    id(admin.from("classes").insert({ school_id: s.id, academic_year_id: y, level_id: level, name }), `class ${name}`);
  const c1 = await klass(A, y1, levelA, "P6-A");
  const c2 = await klass(A, y1, levelA, "P6-B");
  const c3 = await klass(A, y1, levelA, "P6-C");
  const c0 = await klass(A, y0, levelA, "P6-OLD");
  const cB = await klass(B, yB, levelB, "P6-B1");

  const subject = (s, name) => id(admin.from("subjects").insert({ school_id: s.id, name }), `subject ${name}`);
  const math = await subject(A, "P6-Maths");
  const fr = await subject(A, "P6-Français");
  const mathB = await subject(B, "P6-Maths");
  const room = (s, name) => id(admin.from("rooms").insert({ school_id: s.id, name, capacity: 30 }), `room ${name}`);
  const r1 = await room(A, "P6-R1");
  const r2 = await room(A, "P6-R2");
  const rB = await room(B, "P6-RB");

  // As the directors (teachers.manage): the role check trigger is for signed-in users.
  for (const [client, s, t, sub] of [[dirA, A, tch, math], [dirA, A, tch, fr], [dirA, A, tch2.id, fr], [dirB, B, tchB.id, mathB]]) {
    must(await client.from("teacher_subjects").insert({ school_id: s.id, teacher_id: t, subject_id: sub }), "teacher subject");
  }

  // Students: kid1 in c1, kid2 in c2 (this year), kid0 in c0 (last year only).
  const kid = async (name, klassId, y) => {
    const s = await id(admin.from("students").insert({ school_id: A.id, first_name: "Kid", last_name: name, birth_date: "2014-01-01", gender: "male" }), name);
    must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: s, academic_year_id: y, class_id: klassId }), "enrol");
    return s;
  };
  const kid1 = await kid("P6K1", c1, y1);
  const kid2 = await kid("P6K2", c2, y1);
  const kid0 = await kid("P6K0", c0, y0);
  for (const [par, k] of [[par1, kid1], [par2, kid2]]) {
    const g = await id(admin.from("guardians").insert({ school_id: A.id, last_name: "P6", first_name: "Parent", phone: randomMobile(), profile_id: par.id }), "guardian");
    must(await admin.from("student_guardians").insert({ school_id: A.id, student_id: k, guardian_id: g, relation: "father" }), "link");
  }

  // --- Writes -------------------------------------------------------------------------------
  const lesson = (values) => ({ school_id: A.id, academic_year_id: y1, ...values });
  const insert = (client, values) => client.from("lessons").insert(values).select("id");
  const L1 = await id(dirA.from("lessons").insert(lesson({ time_slot_id: s1, class_id: c1, subject_id: math, teacher_id: tch, room_id: r1 })), "L1");
  check("[P6 lessons] director adds a lesson", Boolean(L1));
  const L2 = await id(survA.from("lessons").insert(lesson({ time_slot_id: s2, class_id: c1, subject_id: fr, teacher_id: tch2.id, room_id: r2 })), "L2");
  check("[P6 lessons] surveillant (timetable.manage) adds a lesson", Boolean(L2));

  await refusedWith("a class with two lessons at the same slot is refused",
    insert(dirA, lesson({ time_slot_id: s1, class_id: c1, subject_id: fr, teacher_id: tch2.id })), "23505");
  await refusedWith("a teacher in two places at the same slot is refused",
    insert(dirA, lesson({ time_slot_id: s1, class_id: c2, subject_id: fr, teacher_id: tch })), "23505");
  await refusedWith("a room used twice at the same slot is refused",
    insert(dirA, lesson({ time_slot_id: s1, class_id: c2, subject_id: fr, teacher_id: tch2.id, room_id: r1 })), "23505");
  await refusedWith("a break can never be booked",
    insert(dirA, lesson({ time_slot_id: brk, class_id: c2, subject_id: fr, teacher_id: tch2.id })), "23503");
  await refusedWith("a teacher who does not teach the subject is refused",
    insert(dirA, lesson({ time_slot_id: s3, class_id: c2, subject_id: math, teacher_id: tch2.id })), "23503");
  await refusedWith("a non-teacher account is refused",
    insert(dirA, lesson({ time_slot_id: s3, class_id: c2, subject_id: math, teacher_id: fx.users.survA.id })), "23503");
  await refusedWith("a class of another year is refused",
    insert(dirA, lesson({ time_slot_id: s3, class_id: c0, subject_id: math, teacher_id: tch })), "23503");
  await refusedWith("a time slot of another year is refused",
    insert(dirA, lesson({ time_slot_id: p1, class_id: c2, subject_id: math, teacher_id: tch })), "23503");
  await refusedWith("another school's subject is refused",
    insert(dirA, lesson({ time_slot_id: s3, class_id: c2, subject_id: mathB, teacher_id: tch })), "23503");
  await refusedWith("another school's room is refused",
    insert(dirA, lesson({ time_slot_id: s3, class_id: c2, subject_id: math, teacher_id: tch, room_id: rB })), "23503");
  await refusedWith("another school's teacher is refused",
    insert(dirA, lesson({ time_slot_id: s3, class_id: c2, subject_id: mathB, teacher_id: tchB.id })), "23503");
  await refusedWith("another school's slot is refused",
    insert(dirA, lesson({ time_slot_id: sB, class_id: c2, subject_id: math, teacher_id: tch })), "23503");
  await refusedWith("school B's class under school A's id is refused",
    insert(dirA, lesson({ time_slot_id: s3, class_id: cB, subject_id: math, teacher_id: tch })), "23503");

  const free = lesson({ time_slot_id: s3, class_id: c2, subject_id: math, teacher_id: tch });
  await denied("[P6 lessons] director B cannot add a lesson in school A", insert(dirB, free));
  await denied("[P6 lessons] director B cannot use school A's class in school B",
    insert(dirB, { ...free, school_id: B.id, academic_year_id: yB, time_slot_id: sB }));
  await denied("[P6 lessons] a teacher cannot add lessons", insert(tchA, free));
  await denied("[P6 lessons] a parent cannot add lessons", insert(par1.client, free));
  await denied("[P6 lessons] staff without timetable.manage cannot add lessons", insert(audA, free));
  await denied("[P6 lessons] suspended school's director cannot add lessons", insert(dirC, free));
  await denied("[P6 lessons] platform owner cannot add lessons", insert(owner, free));
  await denied("[P6 lessons] anonymous cannot add lessons", insert(anon(), free));

  // Two lessons without a room never clash on the room.
  const L3 = await id(dirA.from("lessons").insert(lesson({ time_slot_id: s3, class_id: c2, subject_id: math, teacher_id: tch })), "L3");
  await allowed("[P6 lessons] several lessons without a room at the same slot are fine",
    insert(dirA, lesson({ time_slot_id: s3, class_id: c1, subject_id: fr, teacher_id: tch2.id })));
  const L0 = await id(admin.from("lessons").insert({ school_id: A.id, academic_year_id: y0, time_slot_id: p1, class_id: c0, subject_id: math, teacher_id: tch }), "L0");

  // --- Reads --------------------------------------------------------------------------------
  const lessonsOf = (client) => client.from("lessons").select("id, teacher_id, class_id").eq("school_id", A.id);
  await rows("[P6 lessons] director reads every lesson", lessonsOf(dirA), 5);
  await rows("[P6 lessons] surveillant reads every lesson", lessonsOf(survA), 5);
  await rows("[P6 lessons] a teacher reads only their own lessons", lessonsOf(tchA), (r) => r.length === 3 && r.every((l) => l.teacher_id === tch));
  await rows("[P6 lessons] the other teacher reads only theirs", lessonsOf(tch2.client), (r) => r.length === 2 && r.every((l) => l.teacher_id === tch2.id));
  await rows("[P6 lessons] a parent reads only their child's class", lessonsOf(par1.client), (r) => r.length === 3 && r.every((l) => l.class_id === c1));
  await rows("[P6 lessons] the other parent reads only their child's class", lessonsOf(par2.client), (r) => r.length === 1 && r[0].class_id === c2);
  await rows("[P6 lessons] staff without timetable permission reads none", lessonsOf(audA), 0);
  await rows("[P6 lessons] director B reads none of school A", lessonsOf(dirB), 0);
  await rows("[P6 lessons] platform owner reads none", lessonsOf(owner), 0);
  const anonRead = await lessonsOf(anon());
  check("[P6 lessons] anonymous reads none", Boolean(anonRead.error) || anonRead.data?.length === 0, "");

  // Module off: no reads, no writes, even for the director.
  must(await admin.from("school_modules").insert({ school_id: A.id, module_key: "timetable", enabled: false }), "module off");
  await rows("[P6 lessons] module off: director reads none", lessonsOf(dirA), 0);
  await denied("[P6 lessons] module off: director cannot add", insert(dirA, lesson({ time_slot_id: s2, class_id: c2, subject_id: math, teacher_id: tch })));
  must(await admin.from("school_modules").delete().eq("school_id", A.id).eq("module_key", "timetable"), "module back");

  // --- Swap ---------------------------------------------------------------------------------
  const slotOf = async (lessonId) => (await admin.from("lessons").select("time_slot_id").eq("id", lessonId).single()).data.time_slot_id;
  await refusedWith("moving a lesson onto an occupied cell (plain update) is refused",
    dirA.from("lessons").update({ time_slot_id: s2 }).eq("id", L1).select("id"), "23505");
  const swap = (client, a, b) => client.rpc("swap_lessons", { p_a: a, p_b: b });
  const swapped = await swap(dirA, L1, L2);
  check("[P6 lessons] swap_lessons swaps two lessons of a class in one transaction",
    !swapped.error && (await slotOf(L1)) === s2 && (await slotOf(L2)) === s1, swapped.error?.code ?? "");
  // L1 (tchA) is now at s2. Swapping back is fine; but first make tchA busy at s1 in
  // another class: then a swap would put tchA in two places → the whole swap fails.
  const busy = await id(dirA.from("lessons").insert(lesson({ time_slot_id: s1, class_id: c2, subject_id: math, teacher_id: tch })), "busy");
  await refusedWith("a swap that double-books a teacher is refused", swap(dirA, L1, L2), "23505");
  check("[P6 lessons] …and nothing changed", (await slotOf(L1)) === s2 && (await slotOf(L2)) === s1, "");
  await admin.from("lessons").delete().eq("id", busy);
  await refusedWith("swapping lessons of different years is refused", swap(dirA, L1, L0), "P0001");
  await refusedWith("a teacher cannot swap lessons", swap(tchA, L1, L3), "P0001");
  await refusedWith("director B cannot swap school A's lessons", swap(dirB, L1, L2), "P0001");
  const anonSwap = await swap(anon(), L1, L2);
  check("[P6 lessons] anonymous cannot swap", Boolean(anonSwap.error), anonSwap.error?.code ?? "ACCEPTED!");
  check("[P6 lessons] refused swaps changed nothing", (await slotOf(L1)) === s2 && (await slotOf(L2)) === s1, "");

  // --- Teacher names ------------------------------------------------------------------------
  const names = async (client, yearId = y1) => {
    const { data, error } = await client.rpc("timetable_teachers", { p_year: yearId });
    return { error, list: data ?? [] };
  };
  const idsOf = (list) => list.map((t) => t.id).sort();
  const p1Names = await names(par1.client);
  check("[P6 names] a parent gets the names of their child's teachers",
    JSON.stringify(idsOf(p1Names.list)) === JSON.stringify([tch, tch2.id].sort()), JSON.stringify(idsOf(p1Names.list)));
  check("[P6 names] only id, full name and active — no email, no phone",
    p1Names.list.length > 0 && p1Names.list.every((t) => JSON.stringify(Object.keys(t).sort()) === '["active","full_name","id"]'), "");
  const p1Lessons = (await lessonsOf(par1.client)).data ?? [];
  check("[P6 names] a parent's names = the teachers of the lessons they can read",
    JSON.stringify(idsOf(p1Names.list)) === JSON.stringify([...new Set(p1Lessons.map((l) => l.teacher_id))].sort()), "");
  const p2Names = await names(par2.client);
  check("[P6 names] the other parent gets only their child's teacher",
    JSON.stringify(idsOf(p2Names.list)) === JSON.stringify([tch]), JSON.stringify(idsOf(p2Names.list)));
  const tNames = await names(tch2.client);
  check("[P6 names] a teacher gets only their own name", JSON.stringify(idsOf(tNames.list)) === JSON.stringify([tch2.id]), "");
  const sNames = await names(survA);
  check("[P6 names] timetable staff (no users.view) get every teacher of the school",
    [tch, tch2.id].every((t) => idsOf(sNames.list).includes(t)) && !idsOf(sNames.list).includes(tchB.id), "");
  check("[P6 names] director B gets no teacher of school A", !idsOf((await names(dirB, null)).list).some((t) => [tch, tch2.id].includes(t)), "");
  check("[P6 names] staff without timetable permission get none", (await names(audA)).list.length === 0, "");
  check("[P6 names] platform owner gets none", (await names(owner, null)).list.length === 0, "");
  const anonNames = await names(anon());
  check("[P6 names] anonymous cannot call it", Boolean(anonNames.error), anonNames.error?.code ?? "ACCEPTED!");
  await rows("[P6 names] a parent still cannot read the teacher's profile (email, phone)",
    par1.client.from("profiles").select("id, email, phone").in("id", [tch, tch2.id]), 0);
  await rows("[P6 names] timetable staff read which subjects teachers teach",
    survA.from("teacher_subjects").select("subject_id").eq("teacher_id", tch), 2);

  // --- Teachers read the students of the classes they teach this year ---------------------
  const studentsIn = (client, ids) => client.from("students").select("id").in("id", ids);
  await rows("[P6 students] a teacher reads the students of a class they teach this year", studentsIn(tchA, [kid1, kid2]), 2);
  await rows("[P6 students] …but not a class they taught only last year", studentsIn(tchA, [kid0]), 0);
  await rows("[P6 students] a teacher reads no student of a class they do not teach", studentsIn(tch2.client, [kid2]), 0);
  await rows("[P6 students] the other teacher reads their class's students", studentsIn(tch2.client, [kid1]), 1);

  // --- Lessons block deleting what they use -------------------------------------------------
  await refusedWith("a subject used by lessons cannot be deleted", dirA.from("subjects").delete().eq("id", math).select("id"), "23503");
  await refusedWith("a room used by lessons cannot be deleted", dirA.from("rooms").delete().eq("id", r2).select("id"), "23503");
  await refusedWith("a time slot used by lessons cannot be deleted", dirA.from("time_slots").delete().eq("id", s1).select("id"), "23503");
  await refusedWith("a slot used by lessons cannot become a break",
    dirA.from("time_slots").update({ kind: "break" }).eq("id", s1).select("id"), "23503");
  await refusedWith("a subject cannot be taken from a teacher who has lessons of it",
    dirA.from("teacher_subjects").delete().eq("teacher_id", tch).eq("subject_id", math).select("subject_id"), "23503");
  const roleChange = await admin.from("profiles").update({ role_id: A.roles.surveillant }).eq("id", tch2.id);
  check("[P6 lessons] a teacher with lessons cannot be moved to another role", roleChange.error?.code === "23503", roleChange.error?.code ?? "ACCEPTED!");
  const profileDelete = await admin.from("profiles").delete().eq("id", tch2.id);
  check("[P6 lessons] a teacher account with lessons cannot be deleted", profileDelete.error?.code === "23503", profileDelete.error?.code ?? "ACCEPTED!");
  // tchA is free at s1 again (the "busy" lesson was removed).
  const inC3 = await id(dirA.from("lessons").insert(lesson({ time_slot_id: s1, class_id: c3, subject_id: math, teacher_id: tch })), "lesson in c3");
  await allowed("[P6 lessons] deleting a class (no students) deletes its lessons", dirA.from("classes").delete().eq("id", c3).select("id"));
  const { count } = await admin.from("lessons").select("id", { count: "exact", head: true }).eq("id", inC3);
  check("[P6 lessons] …its lessons are gone", count === 0, `${count} left`);

  // Clean up: lessons first (they block deleting the fixture accounts).
  await admin.from("lessons").delete().in("school_id", [A.id, B.id]);
  for (const yearId of previousCurrent) await admin.from("academic_years").update({ is_current: true }).eq("id", yearId);
}
