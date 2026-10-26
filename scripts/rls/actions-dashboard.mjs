// The school dashboard (/dashboard) over HTTP: which cards each role gets
// (permission + module), the roll calls waiting (≥ 15 min after the start,
// against the database clock), and grade_entry_progress compared with the
// grade sheet itself: expected = the sheet's editable columns × students.
import { sessionCookies } from "./app.mjs";
import { check, skip } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { createGradesFixture } from "./grades-fixture.mjs";

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export async function dashboardActions({ fx, baseUrl }) {
  const label = (s) => `[dashboard page] ${s}`;
  const A = fx.schools.a;
  const f = await createGradesFixture(fx, "dsp");
  const cookies = {};
  for (const name of ["dirA", "survA", "tchA", "mgrA"]) cookies[name] = await sessionCookies(fx.users[name]);
  cookies.parent = await sessionCookies(f.parent);
  const page = async (who, path) => {
    const res = await fetch(new URL(path, baseUrl), { headers: { cookie: cookies[who] }, redirect: "manual" });
    const html = res.status === 200 ? await res.text() : "";
    const streamed = html.match(/NEXT_REDIRECT;\w+;([^;]+);/)?.[1];
    return { status: res.status, redirect: streamed ?? res.headers.get("location") ?? "", html: streamed ? "" : html };
  };
  const has = (html, card) => html.includes(`data-dashboard-card="${card}"`);
  const [S1] = f.periods;
  const { maths, hist } = f.subjects;
  const { a1, a2 } = f.students;
  const { cA } = f.classes;
  const clean = [];

  try {
    const { error } = await admin.from("grades").insert([
      { school_id: A.id, period_id: S1.id, student_id: a1, subject_id: maths, kind: "control", number: 1, score: 12, absent: false },
      { school_id: A.id, period_id: S1.id, student_id: a2, subject_id: hist, kind: "control", number: 2, score: null, absent: true },
    ]);
    if (error) throw new Error(`dashboard fixture: ${error.message}`);
    clean.unshift(() => admin.from("grades").delete().eq("period_id", S1.id));

    // --- Roll calls waiting, against the database clock -----------------------------------------------
    const dirA = await signIn(fx.users.dirA);
    const { data: clock } = await dirA.rpc("school_clock").single();
    const now = Number(clock.local_time.slice(0, 2)) * 60 + Number(clock.local_time.slice(3, 5));
    const canTimeTest = clock.weekday <= 6 && now >= 60;
    const lessonIds = {};
    if (canTimeTest) {
      const { data: day } = await admin.from("school_days").select("day_of_week").eq("academic_year_id", f.year).eq("day_of_week", clock.weekday).maybeSingle();
      if (!day) {
        await admin.from("school_days").insert({ school_id: A.id, academic_year_id: f.year, day_of_week: clock.weekday });
        clean.unshift(() => admin.from("school_days").delete().eq("academic_year_id", f.year).eq("day_of_week", clock.weekday));
      }
      // Minute-long slots: taken 40 min ago (has its roll call), 30 min ago (waiting), 5 min ago (too early).
      const plan = { taken: now - 40, waiting: now - 30, early: now - 5 };
      for (const [key, start] of Object.entries(plan)) {
        const { data: slot, error: se } = await admin.from("time_slots").insert({
          school_id: A.id, academic_year_id: f.year, day_of_week: clock.weekday, start_time: hhmm(start), end_time: hhmm(start + 1), kind: "lesson",
        }).select("id").single();
        if (se) throw new Error(`slot ${key}: ${se.message}`);
        clean.unshift(() => admin.from("time_slots").delete().eq("id", slot.id));
        const { data: lesson, error: le } = await admin.from("lessons").insert({
          school_id: A.id, academic_year_id: f.year, time_slot_id: slot.id, class_id: cA, subject_id: maths, teacher_id: f.tch,
        }).select("id").single();
        if (le) throw new Error(`lesson ${key}: ${le.message}`);
        clean.unshift(() => admin.from("lessons").delete().eq("id", lesson.id));
        lessonIds[key] = lesson.id;
      }
      const { data: session } = await admin.from("attendance_sessions").insert({
        school_id: A.id, lesson_id: lessonIds.taken, session_date: clock.local_date, taken_by: fx.users.dirA.id, updated_by: fx.users.dirA.id,
      }).select("id").single();
      clean.unshift(() => admin.from("attendance_sessions").delete().eq("id", session.id));
    }

    // --- Director: every card ----------------------------------------------------------------------------
    const dir = await page("dirA", "/fr/dashboard");
    check(label("director: the 4 tiles and the 6 cards"),
      ["absent", "late", "rollCalls", "justifications"].every((x) => dir.html.includes(`data-dashboard-tile="${x}"`))
        && ["waiting", "week", "topClasses", "gradeProgress", "publications", "counts"].every((x) => has(dir.html, x)), `${dir.status} ${dir.redirect}`);
    check(label("…counts: students, classes and teachers"), ["students", "classes", "teachers"].every((x) => dir.html.includes(`data-count="${x}"`)));
    if (canTimeTest) {
      check(label("roll calls: a lesson started 30 min ago without roll call is waiting; one with its roll call, or started 5 min ago, is not"),
        dir.html.includes(`data-waiting="${lessonIds.waiting}"`) && !dir.html.includes(`data-waiting="${lessonIds.taken}"`) && !dir.html.includes(`data-waiting="${lessonIds.early}"`));
    } else {
      skip(label("roll calls waiting (needs a school day and a clock after 01:00)"), `${clock.weekday} ${clock.local_time}`);
    }

    // --- Grade progress = the sheet's own columns -----------------------------------------------------
    const columnsOf = async (subject) => {
      const sheet = await page("dirA", `/fr/grades?year=${f.year}&class=${cA}&subject=${subject}&period=${S1.id}`);
      return new Set([...sheet.html.matchAll(new RegExp(`data-mark="${a1}\\|([a-z]+\\|\\d+)"`, "g"))].map((m) => m[1])).size;
    };
    const perStudent = (await columnsOf(maths)) + (await columnsOf(hist));
    const { data: rows } = await dirA.rpc("grade_entry_progress", { p_period: S1.id });
    const rowA = (rows ?? []).find((r) => r.class_id === cA);
    const { data: averages } = await dirA.rpc("class_averages", { p_class: cA });
    const enteredByAverages = (averages ?? []).filter((r) => r.period_id === S1.id && r.subject_id).reduce((n, r) => n + (r.marks ?? 0) + (r.absences ?? 0), 0);
    check(label("grade_entry_progress expected = the sheet's editable columns (Maths + HG) × 3 students"),
      perStudent === 7 && rowA?.expected === perStudent * 3, `sheet ${perStudent} per student, rpc ${rowA?.expected}`);
    check(label("…entered = the marks class_averages() counts (a score and an abs)"), rowA?.entered === 2 && enteredByAverages === 2, `${rowA?.entered} / ${enteredByAverages}`);
    check(label("…and the dashboard shows it for that class"), dir.html.includes(`data-bar-row="${cA}" data-bar-value="2"`));

    // --- Other roles ----------------------------------------------------------------------------------
    const surv = await page("survA", "/fr/dashboard");
    check(label("surveillant: the attendance and grade cards"), has(surv.html, "waiting") && has(surv.html, "gradeProgress") && surv.html.includes('data-dashboard-tile="absent"'));
    const mgr = await page("mgrA", "/fr/dashboard");
    check(label("office manager: no attendance or grade card"), mgr.status === 200 && !mgr.html.includes("data-dashboard-tile=") && !has(mgr.html, "gradeProgress"));
    const tch = await page("tchA", "/fr/dashboard");
    check(label("teacher: their own home, no dashboard card"), tch.status === 200 && !tch.html.includes("data-dashboard-card="));
    const par = await page("parent", "/fr/dashboard");
    check(label("parent: sent to the portal"), par.redirect !== "" && !par.html.includes("data-dashboard-card="), par.redirect);
    await admin.from("school_modules").update({ enabled: false }).eq("school_id", A.id).eq("module_key", "grades");
    const off = await page("dirA", "/fr/dashboard");
    check(label("grades module off: no grade card, attendance still there"), !has(off.html, "gradeProgress") && !has(off.html, "publications") && has(off.html, "week"));
    await admin.from("school_modules").update({ enabled: true }).eq("school_id", A.id).eq("module_key", "grades");
    const ar = await page("dirA", "/ar/dashboard");
    check(label("Arabic: the page is right to left"), ar.html.includes('dir="rtl"') && has(ar.html, "week"));
  } finally {
    await admin.from("school_modules").update({ enabled: true }).eq("school_id", A.id).eq("module_key", "grades");
    for (const step of clean) await step();
    await f.cleanup();
  }
}
