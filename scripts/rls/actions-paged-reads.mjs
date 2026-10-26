// The Data API's 1000-row cap (2026-10-26) over HTTP, with real volumes:
//  1. a year with 9 classes × 144 lessons = 1296 lessons: the teachers' weekly
//     hours on /timetable and the "all classes" print show every lesson;
//  2. a class where one student is absent in more than 1000 sessions (+ 5
//     absences for each of 39 others): the class totals (/absences, year),
//     the student's card (/students/[id]) and the parent's page
//     (/portal/absences) count every one of them.
// Before readAll() these stopped at 1000 rows.
import { randomBytes } from "node:crypto";

import { sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { createGradesFixture } from "./grades-fixture.mjs";

const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const hhmm = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

async function insertAll(table, rows, what) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from(table).insert(rows.slice(i, i + 500));
    if (error) throw new Error(`paged reads fixture: ${what} (${error.code} ${error.message})`);
  }
}

export async function pagedReadsActions({ fx, baseUrl }) {
  const label = (s) => `[paged reads] ${s}`;
  const A = fx.schools.a;
  const f = await createGradesFixture(fx, "p11pr");
  const cookies = { dirA: await sessionCookies(fx.users.dirA), parent: await sessionCookies(f.parent) };
  const page = async (who, path) => {
    const res = await fetch(new URL(path, baseUrl), { headers: { cookie: cookies[who] }, redirect: "manual" });
    return { status: res.status, html: res.status === 200 ? await res.text() : "" };
  };
  const must = (r, what) => {
    if (r.error) throw new Error(`paged reads fixture: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (q, what) => must(await q.select("id").single(), what).id;
  const clean = [];

  try {
    // --- 1. Timetable: 1296 lessons in one year -------------------------------------------------------
    const yearT = await id(admin.from("academic_years").insert({ school_id: A.id, label: `p11pr-tt-${fx.run}`, start_date: "2095-09-01", end_date: "2096-06-30", is_current: false }), "tt year");
    clean.unshift(() => admin.from("academic_years").delete().eq("id", yearT));
    await insertAll("school_days", [1, 2, 3, 4, 5, 6].map((d) => ({ school_id: A.id, academic_year_id: yearT, day_of_week: d })), "tt days");
    const slotRows = [];
    for (let d = 1; d <= 6; d++) for (let k = 0; k < 24; k++) {
      slotRows.push({ school_id: A.id, academic_year_id: yearT, day_of_week: d, start_time: hhmm(420 + 30 * k), end_time: hhmm(450 + 30 * k), kind: "lesson" });
    }
    await insertAll("time_slots", slotRows, "tt slots");
    clean.unshift(() => admin.from("time_slots").delete().eq("academic_year_id", yearT));
    clean.unshift(() => admin.from("school_days").delete().eq("academic_year_id", yearT));
    const slots = must(await admin.from("time_slots").select("id").eq("academic_year_id", yearT), "tt slot ids");
    const levelT = await id(admin.from("levels").insert({ school_id: A.id, name: `p11pr-L-${fx.run}`, cycle: "college" }), "tt level");
    clean.unshift(() => admin.from("levels").delete().eq("id", levelT));
    const subjectT = await id(admin.from("subjects").insert({ school_id: A.id, name: `p11pr-S-${fx.run}` }), "tt subject");
    clean.unshift(() => admin.from("subjects").delete().eq("id", subjectT));
    const dirA = await signIn(fx.users.dirA);
    const classesT = [];
    const teachersT = [];
    for (let i = 0; i < 9; i++) {
      classesT.push(await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: yearT, level_id: levelT, name: `p11pr-${i}-${fx.run}` }), "tt class"));
      const email = `rls-test+${fx.run}-p11prt${i}@example.com`;
      const user = must(await admin.auth.admin.createUser({ email, password: `${randomBytes(12).toString("base64url")}a1`, email_confirm: true }), "tt teacher").user;
      fx.createdUserIds.push(user.id);
      must(await admin.from("profiles").insert({ id: user.id, school_id: A.id, role_id: A.roles.teacher, full_name: `RLS p11pr T${i}`, email, must_change_password: false }), "tt profile");
      must(await dirA.from("teacher_subjects").insert({ school_id: A.id, teacher_id: user.id, subject_id: subjectT }), "tt teaches");
      teachersT.push(user.id);
    }
    clean.unshift(() => admin.from("classes").delete().in("id", classesT));
    clean.unshift(() => admin.from("teacher_subjects").delete().eq("subject_id", subjectT));
    clean.unshift(() => admin.from("lessons").delete().eq("academic_year_id", yearT));
    await insertAll("lessons", classesT.flatMap((c, i) => slots.map((s) => (
      { school_id: A.id, academic_year_id: yearT, time_slot_id: s.id, class_id: c, subject_id: subjectT, teacher_id: teachersT[i] }))), "tt lessons");
    const { count: lessonCount } = await admin.from("lessons").select("id", { count: "exact", head: true }).eq("academic_year_id", yearT);

    const tt = await page("dirA", `/fr/timetable?year=${yearT}&view=teacher&teacher=${teachersT[0]}`);
    const fullWeeks = teachersT.filter((t) => tt.html.includes(`data-teacher-hours="${t}" data-minutes="4320"`)).length;
    check(label(`timetable: ${lessonCount} lessons in the year; each of the 9 teachers has their 144 lessons (72 h)`),
      lessonCount === 1296 && fullWeeks === 9, `${lessonCount} lessons, ${fullWeeks}/9 full`);
    const print = await page("dirA", `/fr/print/timetable?view=class&all=1&year=${yearT}`);
    const printed = (print.html.match(/data-print-lesson="/g) ?? []).length;
    check(label("print, every class: all 1296 lessons on the sheets"), printed === 1296, String(printed));

    // --- 2. Attendance: one student absent in more than 1000 sessions ---------------------------------
    const { data: year } = await admin.from("academic_years").select("start_date").eq("id", f.year).single();
    const { data: days } = await admin.from("school_days").select("day_of_week").eq("academic_year_id", f.year);
    const missingDays = [1, 2, 3, 4, 5, 6].filter((d) => !(days ?? []).some((x) => x.day_of_week === d));
    if (missingDays.length) await insertAll("school_days", missingDays.map((d) => ({ school_id: A.id, academic_year_id: f.year, day_of_week: d })), "att days");
    clean.unshift(() => missingDays.length && admin.from("school_days").delete().eq("academic_year_id", f.year).in("day_of_week", missingDays));
    // 30 slots a day, 05:00 → 20:00 (the fixture's own slot is at 23:20).
    const attSlots = [];
    for (let d = 1; d <= 6; d++) for (let k = 0; k < 30; k++) {
      attSlots.push({ school_id: A.id, academic_year_id: f.year, day_of_week: d, start_time: hhmm(300 + 30 * k), end_time: hhmm(330 + 30 * k), kind: "lesson" });
    }
    const slotIds = [];
    for (let i = 0; i < attSlots.length; i += 500) {
      slotIds.push(...must(await admin.from("time_slots").insert(attSlots.slice(i, i + 500)).select("id, day_of_week"), "att slots"));
    }
    clean.unshift(() => admin.from("time_slots").delete().in("id", slotIds.map((s) => s.id)));
    const cT = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: f.year, level_id: f.college, name: `p11pr-T-${fx.run}` }), "att class");
    clean.unshift(() => admin.from("classes").delete().eq("id", cT));
    const kids = must(await admin.from("students").insert(Array.from({ length: 40 }, (_, i) => (
      { school_id: A.id, first_name: "Élève", last_name: `P11pr${String(i).padStart(2, "0")}`, birth_date: "2012-01-01", gender: "female" }))).select("id, last_name"), "att students")
      .sort((a, b) => a.last_name.localeCompare(b.last_name));
    const ids = kids.map((k) => k.id);
    clean.unshift(() => admin.from("students").delete().in("id", ids));
    await insertAll("student_enrollments", ids.map((s) => ({ school_id: A.id, student_id: s, academic_year_id: f.year, class_id: cT })), "att enrol");
    const s1 = ids[0];
    const { data: guardian } = await admin.from("guardians").select("id").eq("profile_id", f.parent.id).single();
    must(await admin.from("student_guardians").insert({ school_id: A.id, student_id: s1, guardian_id: guardian.id, relation: "mother" }), "att link");
    clean.unshift(() => admin.from("student_guardians").delete().eq("student_id", s1));
    const lessonsT = [];
    for (const s of slotIds) lessonsT.push({ school_id: A.id, academic_year_id: f.year, time_slot_id: s.id, class_id: cT, subject_id: f.subjects.maths, teacher_id: f.tch });
    const attLessons = [];
    for (let i = 0; i < lessonsT.length; i += 500) {
      attLessons.push(...must(await admin.from("lessons").insert(lessonsT.slice(i, i + 500)).select("id, time_slot_id"), "att lessons"));
    }
    clean.unshift(() => admin.from("lessons").delete().in("id", attLessons.map((l) => l.id)));
    const dayOfSlot = new Map(slotIds.map((s) => [s.id, s.day_of_week]));
    // Past school days only (no "today", older than 7 days: no absence notice is due).
    const sessions = [];
    for (let t = Date.now() - 63 * DAY; t <= Date.now() - 8 * DAY; t += DAY) {
      const date = iso(t);
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      if (weekday === 0 || date < year.start_date) continue;
      for (const l of attLessons) {
        if (dayOfSlot.get(l.time_slot_id) === weekday) {
          sessions.push({ school_id: A.id, lesson_id: l.id, session_date: date, taken_by: fx.users.dirA.id, updated_by: fx.users.dirA.id });
        }
      }
    }
    const sessionIds = [];
    for (let i = 0; i < sessions.length; i += 500) {
      sessionIds.push(...must(await admin.from("attendance_sessions").insert(sessions.slice(i, i + 500)).select("id"), "att sessions").map((s) => s.id));
    }
    clean.unshift(async () => {
      for (let i = 0; i < sessionIds.length; i += 200) await admin.from("attendance_sessions").delete().in("id", sessionIds.slice(i, i + 200));
    });
    const N = sessionIds.length;
    const mark = (session, student) => ({ school_id: A.id, session_id: session, student_id: student, status: "absent", marked_by: fx.users.dirA.id });
    await insertAll("attendance_marks", [
      ...sessionIds.map((s) => mark(s, s1)),
      ...ids.slice(1).flatMap((st) => sessionIds.slice(0, 5).map((s) => mark(s, st))),
    ], "att marks");

    const totals = await page("dirA", `/fr/absences?view=totals&class=${cT}&period=year`);
    const s1Abs = Number(totals.html.match(new RegExp(`data-totals-student="${s1}" data-absences="(\\d+)"`))?.[1]);
    const fives = ids.slice(1).filter((st) => totals.html.includes(`data-totals-student="${st}" data-absences="5"`)).length;
    check(label(`class totals (year): ${N} sessions seeded (> 1000): the student absent in all of them shows ${N}, the 39 others 5 each`),
      N > 1000 && s1Abs === N && fives === 39, `${N} seeded, shown ${s1Abs}, ${fives}/39`);
    const card = await page("dirA", `/fr/students/${s1}`);
    const cardAbs = Number(card.html.match(/data-student-absences="(\d+)"/)?.[1]);
    check(label("the student's card (year): every absence"), cardAbs === N, `${cardAbs} / ${N}`);
    const portal = await page("parent", `/fr/portal/absences?child=${s1}`);
    const parentAbs = Number(portal.html.match(/data-child-absences="(\d+)"/)?.[1]);
    check(label("the parent's page (year): every absence"), parentAbs === N, `${parentAbs} / ${N}`);
  } finally {
    for (const step of clean) await step();
    await f.cleanup();
  }
}
