// Dashboard aggregates (migration dashboard_aggregates): attendance_summary
// and grade_entry_progress, hand-computed cases, who gets rows (staff with the
// permission) and who gets none (teacher, parent, office, another school,
// module off), range limits; and the school's clock around midnight in
// Africa/Casablanca (public.school_clock: "today" for the dashboard).
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";
import { createGradesFixture } from "./grades-fixture.mjs";

const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const weekday = (d) => (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7 + 1; // 1 = Monday … 7 = Sunday

export async function dashboardAggregates({ fx, as }) {
  const label = (s) => `[dashboard] ${s}`;
  const A = fx.schools.a;
  const f = await createGradesFixture(fx, "dsh");
  const must = (r, what) => {
    if (r.error) throw new Error(`dashboard fixture: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const clean = [];

  try {
    // --- The clock around midnight (Casablanca: UTC+1 until 2026-09-20, then UTC+0) -----------------------
    const clockAt = async (at) => (await as.dirA.rpc("school_clock", { p_at: at }).single()).data;
    const c1 = await clockAt("2026-10-26T23:59:30Z");
    const c2 = await clockAt("2026-10-27T00:00:30Z");
    check(label("23:59:30 UTC on 26 Oct = still 26 Oct at the school; 00:00:30 = 27 Oct"),
      c1?.local_date === "2026-10-26" && c1?.local_time === "23:59" && c2?.local_date === "2026-10-27" && c2?.local_time === "00:00", JSON.stringify([c1, c2]));
    const summer = await clockAt("2026-06-15T23:30:00Z");
    check(label("15 June 23:30 UTC = 16 June 00:30 at the school (UTC+1 before 20 September 2026)"),
      summer?.local_date === "2026-06-16" && summer?.local_time === "00:30", JSON.stringify(summer));

    // --- attendance_summary -------------------------------------------------------------------------------
    // X = a past school day whose day before is a school day too (both in the year).
    const { data: year } = await admin.from("academic_years").select("start_date").eq("id", f.year).single();
    let X = null;
    for (let t = Date.now() - DAY; t > Date.now() - 20 * DAY; t -= DAY) {
      const d = iso(t);
      if (weekday(d) <= 6 && weekday(d) !== 1 && iso(t - DAY) >= year.start_date) { X = d; break; }
    }
    const Y = iso(new Date(`${X}T12:00:00Z`).getTime() - DAY);
    const { data: days } = await admin.from("school_days").select("day_of_week").eq("academic_year_id", f.year);
    const missing = [weekday(X), weekday(Y)].filter((d) => !(days ?? []).some((x) => x.day_of_week === d));
    if (missing.length) must(await admin.from("school_days").insert(missing.map((d) => ({ school_id: A.id, academic_year_id: f.year, day_of_week: d }))), "days");
    clean.unshift(() => missing.length && admin.from("school_days").delete().eq("academic_year_id", f.year).in("day_of_week", missing));
    const slots = must(await admin.from("time_slots").insert([
      { school_id: A.id, academic_year_id: f.year, day_of_week: weekday(X), start_time: "06:00", end_time: "06:30", kind: "lesson" },
      { school_id: A.id, academic_year_id: f.year, day_of_week: weekday(X), start_time: "06:30", end_time: "07:00", kind: "lesson" },
      { school_id: A.id, academic_year_id: f.year, day_of_week: weekday(Y), start_time: "06:00", end_time: "06:30", kind: "lesson" },
    ]).select("id, day_of_week, start_time"), "slots");
    clean.unshift(() => admin.from("time_slots").delete().in("id", slots.map((s) => s.id)));
    const cD = must(await admin.from("classes").insert({ school_id: A.id, academic_year_id: f.year, level_id: f.college, name: `dsh-D-${fx.run}` }).select("id").single(), "class").id;
    clean.unshift(() => admin.from("classes").delete().eq("id", cD));
    const kids = must(await admin.from("students").insert([1, 2, 3].map((i) => (
      { school_id: A.id, first_name: "K", last_name: `Dsh${i}`, birth_date: "2012-01-01", gender: "male" }))).select("id, last_name"), "kids")
      .sort((a, b) => a.last_name.localeCompare(b.last_name)).map((k) => k.id);
    clean.unshift(() => admin.from("students").delete().in("id", kids));
    must(await admin.from("student_enrollments").insert(kids.map((s) => ({ school_id: A.id, student_id: s, academic_year_id: f.year, class_id: cD }))), "enrol");
    const lessons = must(await admin.from("lessons").insert(slots.map((s) => (
      { school_id: A.id, academic_year_id: f.year, time_slot_id: s.id, class_id: cD, subject_id: f.subjects.maths, teacher_id: f.tch }))).select("id, time_slot_id"), "lessons");
    clean.unshift(() => admin.from("lessons").delete().in("id", lessons.map((l) => l.id)));
    const dayOf = new Map(slots.map((s) => [s.id, s.day_of_week]));
    const sessions = must(await admin.from("attendance_sessions").insert(lessons.map((l) => (
      { school_id: A.id, lesson_id: l.id, session_date: dayOf.get(l.time_slot_id) === weekday(X) ? X : Y,
        taken_by: fx.users.dirA.id, updated_by: fx.users.dirA.id }))).select("id, session_date"), "sessions");
    clean.unshift(() => admin.from("attendance_sessions").delete().in("id", sessions.map((s) => s.id)));
    const [onX1, onX2] = sessions.filter((s) => s.session_date === X);
    const onY = sessions.find((s) => s.session_date === Y);
    const mark = (session, student, status) => ({ school_id: A.id, session_id: session.id, student_id: student, status, marked_by: fx.users.dirA.id });
    // X: kid1 + kid2 absent and kid3 late in lesson 1; kid1 absent again in lesson 2. Y: kid3 absent.
    must(await admin.from("attendance_marks").insert([
      mark(onX1, kids[0], "absent"), mark(onX1, kids[1], "absent"), mark(onX1, kids[2], "late"),
      mark(onX2, kids[0], "absent"), mark(onY, kids[2], "absent"),
    ]), "marks");
    const summary = async (client, from, to) => client.rpc("attendance_summary", { p_from: from, p_to: to });
    const rowD = (rows) => (rows ?? []).find((r) => r.class_id === cD);
    const { data: dX, error: eX } = await summary(as.dirA, X, X);
    check(label("one day: 3 absence marks (sessions missed), 1 late, 2 distinct students absent"),
      !eX && rowD(dX)?.absent_marks === 3 && rowD(dX)?.late_marks === 1 && rowD(dX)?.absent_students === 2, eX?.message ?? JSON.stringify(rowD(dX)));
    const { data: dXY } = await summary(as.dirA, Y, X);
    check(label("two days: 4 absence marks, 3 distinct students (the date range is inclusive at both ends)"),
      rowD(dXY)?.absent_marks === 4 && rowD(dXY)?.absent_students === 3, JSON.stringify(rowD(dXY)));
    const { data: dY } = await summary(as.dirA, Y, Y);
    check(label("the day before alone: 1 absence"), rowD(dY)?.absent_marks === 1 && rowD(dY)?.late_marks === 0);
    const { data: surv } = await summary(as.survA, Y, X);
    check(label("the surveillant (attendance.view) gets the same row"), rowD(surv)?.absent_marks === 4);
    for (const [who, client] of [["a teacher", as.tchA], ["a parent", f.parent.client], ["an office manager", as.mgrA]]) {
      const { data, error } = await summary(client, Y, X);
      check(label(`${who} gets no row (no error)`), !error && (data ?? []).length === 0, error?.message ?? `${data?.length} rows`);
    }
    const { data: bRows } = await summary(as.dirB, Y, X);
    check(label("the director of B gets none of A's classes"), !(bRows ?? []).some((r) => r.class_id === cD));
    const { error: reversed } = await summary(as.dirA, X, Y);
    const { error: tooLong } = await summary(as.dirA, "2025-01-01", "2026-06-30");
    check(label("a reversed range and more than 366 days are refused (attendance_summary_range)"),
      reversed?.message?.includes("attendance_summary_range") && tooLong?.message?.includes("attendance_summary_range"), `${reversed?.message} / ${tooLong?.message}`);
    const { error: anonErr } = await as.anon.rpc("attendance_summary", { p_from: X, p_to: X });
    check(label("signed out: no execute"), !!anonErr);

    // --- grade_entry_progress -----------------------------------------------------------------------------
    // cA: Maths 2 contrôles (subject override) + activités = 3, HG 3 (level) + activités = 4 → 7 per student, 3 students.
    // cP (primaire): Maths, level defaults 4 contrôles, no activités → 4 per student, 1 student.
    const [S1] = f.periods;
    const { a1, a2, a3, p1 } = f.students;
    const g = (st, subj, kind, n, score, absent = false) =>
      ({ school_id: A.id, period_id: S1.id, student_id: st, subject_id: subj, kind, number: n, score: absent ? null : score, absent });
    must(await admin.from("grades").insert([
      g(a1, f.subjects.maths, "control", 1, 12), g(a1, f.subjects.maths, "activities", 1, 14), g(a2, f.subjects.maths, "control", 2, null, true),
      g(a1, f.subjects.hist, "control", 1, 9), g(p1, f.subjects.maths, "control", 4, 7),
    ]), "grades");
    // An old column: Maths had 3 contrôles, a3 got contrôle 3, then back to 2: still an entered mark.
    await admin.from("subject_coefficients").update({ controls_count: 3 }).eq("academic_year_id", f.year).eq("level_id", f.college).eq("subject_id", f.subjects.maths);
    must(await admin.from("grades").insert(g(a3, f.subjects.maths, "control", 3, 10)), "old column");
    await admin.from("subject_coefficients").update({ controls_count: 2 }).eq("academic_year_id", f.year).eq("level_id", f.college).eq("subject_id", f.subjects.maths);
    clean.unshift(() => admin.from("grades").delete().eq("period_id", S1.id));

    const progress = async (client, period = S1.id) => client.rpc("grade_entry_progress", { p_period: period });
    const { data: pr, error: pe } = await progress(as.dirA);
    const of = (rows, c) => (rows ?? []).find((r) => r.class_id === c);
    check(label("1AC-A-like class: 3 students × 7 = 21 expected, 5 entered (abs and an old column included)"),
      !pe && of(pr, f.classes.cA)?.students === 3 && of(pr, f.classes.cA)?.expected === 21 && of(pr, f.classes.cA)?.entered === 5, pe?.message ?? JSON.stringify(of(pr, f.classes.cA)));
    check(label("primaire class: level defaults (4 contrôles, no activités) → 1 × 4 expected, 1 entered"),
      of(pr, f.classes.cP)?.expected === 4 && of(pr, f.classes.cP)?.entered === 1, JSON.stringify(of(pr, f.classes.cP)));
    check(label("a class with no student: 0 expected (and listed)"), of(pr, cD)?.students === 3 && (pr ?? []).length >= 4);
    // Filière: HG row of the track with 2 contrôles wins over the common row → 3 + (2 + 1) = 6 per student.
    const track = must(await admin.from("tracks").insert({ school_id: A.id, level_id: f.college, name: `dsh-T-${fx.run}` }).select("id").single(), "track").id;
    clean.unshift(() => admin.from("tracks").delete().eq("id", track));
    const cT = must(await admin.from("classes").insert({ school_id: A.id, academic_year_id: f.year, level_id: f.college, track_id: track, name: `dsh-F-${fx.run}` }).select("id").single(), "track class").id;
    clean.unshift(() => admin.from("classes").delete().eq("id", cT));
    must(await admin.from("subject_coefficients").insert({ school_id: A.id, academic_year_id: f.year, level_id: f.college, track_id: track, subject_id: f.subjects.hist, coefficient: 3, controls_count: 2 }), "track coef");
    clean.unshift(() => admin.from("subject_coefficients").delete().eq("track_id", track));
    const tKid = must(await admin.from("students").insert({ school_id: A.id, first_name: "T", last_name: "DshTrack", birth_date: "2012-01-01", gender: "male" }).select("id").single(), "track kid").id;
    clean.unshift(() => admin.from("students").delete().eq("id", tKid));
    must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: tKid, academic_year_id: f.year, class_id: cT }), "track enrol");
    const { data: pr2 } = await progress(as.dirA);
    check(label("filière class: the track's HG row wins (2 + activités) + Maths 3 = 6 expected"), of(pr2, cT)?.expected === 6, JSON.stringify(of(pr2, cT)));

    const { data: survP } = await progress(as.survA);
    check(label("the surveillant (grades.view) gets the same numbers"), of(survP, f.classes.cA)?.expected === 21 && of(survP, f.classes.cA)?.entered === 5);
    for (const [who, client] of [["a teacher", as.tchA], ["a parent", f.parent.client], ["an office manager", as.mgrA]]) {
      const { data, error } = await progress(client);
      check(label(`grade progress: ${who} gets no row (no error)`), !error && (data ?? []).length === 0, error?.message ?? `${data?.length} rows`);
    }
    const { data: bP, error: bE } = await progress(as.dirB);
    check(label("the director of B asking for A's semester: no row"), !bE && (bP ?? []).length === 0);
    await admin.from("school_modules").update({ enabled: false }).eq("school_id", A.id).eq("module_key", "grades");
    const { data: off } = await progress(as.dirA);
    check(label("grades module off: no row"), (off ?? []).length === 0);
    await admin.from("school_modules").update({ enabled: true }).eq("school_id", A.id).eq("module_key", "grades");
    // The attendance module may have no override row (it comes with every plan): add one, then remove it.
    const { data: attRow } = await admin.from("school_modules").select("enabled").eq("school_id", A.id).eq("module_key", "attendance").maybeSingle();
    if (attRow) await admin.from("school_modules").update({ enabled: false }).eq("school_id", A.id).eq("module_key", "attendance");
    else must(await admin.from("school_modules").insert({ school_id: A.id, module_key: "attendance", enabled: false }), "attendance off");
    const { data: attOff } = await summary(as.dirA, Y, X);
    check(label("attendance module off: no row"), (attOff ?? []).length === 0, `${attOff?.length} rows`);
    if (attRow) await admin.from("school_modules").update({ enabled: attRow.enabled }).eq("school_id", A.id).eq("module_key", "attendance");
    else await admin.from("school_modules").delete().eq("school_id", A.id).eq("module_key", "attendance");
  } finally {
    await admin.from("school_modules").update({ enabled: true }).eq("school_id", A.id).eq("module_key", "grades");
    for (const step of clean) await step();
    await f.cleanup();
  }
}
