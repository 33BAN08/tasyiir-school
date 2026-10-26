// Empty cells made visible (display only; averages unchanged): marks entered /
// expected next to each subject average on /grades/averages and in the grade
// sheet, the empty / abs / 0 hint, the lock preview (previewLockGaps), and the
// API row cap: a 40-student class with 12 subjects (1560 averages rows) shows
// every student and subject.
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";
import { createGradesFixture } from "./grades-fixture.mjs";

export async function gradeGapsActions({ fx, baseUrl }) {
  const label = (s) => `[P11 gaps] ${s}`;
  const f = await createGradesFixture(fx, "p11gp");
  const A = f.A;
  const { maths, hist } = f.subjects;
  const { a1, a2 } = f.students;
  const { cA } = f.classes;
  const [S1] = f.periods;
  const previewId = actionId("src/lib/grades/gaps-actions.ts", "previewLockGaps");
  const cookies = {};
  for (const name of ["dirA", "survA", "tchA", "dirB"]) cookies[name] = await sessionCookies(fx.users[name]);
  const preview = (who, ...args) => callAction(baseUrl, { id: previewId, path: "/fr/setup/grading", args, cookies: cookies[who] });
  const page = async (who, path) => {
    const res = await fetch(new URL(path, baseUrl), { headers: { cookie: cookies[who] }, redirect: "manual" });
    return { status: res.status, html: res.status === 200 ? await res.text() : "" };
  };
  const grade = (student, subject, number, score, kind = "control", absent = false) =>
    ({ school_id: A.id, period_id: S1.id, student_id: student, subject_id: subject, kind, number, score: absent ? null : score, absent });
  const cellOf = (html, student, subject) =>
    html.split(`data-student="${student}"`)[1]?.split("</tr>")[0]?.split(`data-average="${subject}"`)[1]?.split("</td>")[0] ?? "";
  const extraStudents = [];
  const extraSubjects = [];

  try {
    // Maths: 2 contrôles + activités = 3 expected; HG: 3 + activités = 4.
    const { error } = await admin.from("grades").insert([
      grade(a1, maths, 1, 14), grade(a1, maths, 2, 12), grade(a1, maths, 1, 15, "activities"),
      grade(a2, maths, 1, 10), grade(a2, maths, 2, null, "control", true),
      grade(a1, hist, 1, 0),
    ]);
    if (error) throw new Error(`gaps fixture: ${error.message}`);

    // --- Moyennes: "average · entered/expected" + incomplet ---------------------------------------------
    const avg = await page("dirA", `/fr/grades/averages?year=${f.year}&class=${cA}&period=${S1.id}`);
    const a1m = cellOf(avg.html, a1, maths);
    check(label("a1 Maths complete: 3/3, no incomplet marker"), a1m.includes('data-average-count="3/3"') && !a1m.includes("data-incomplete"), a1m.slice(0, 200));
    const a2m = cellOf(avg.html, a2, maths);
    check(label("a2 Maths: a mark + abs = 2 entered of 3 (abs is entered), incomplet"), a2m.includes('data-average-count="2/3"') && a2m.includes("data-incomplete"));
    const a1h = cellOf(avg.html, a1, hist);
    check(label("a1 HG: one 0 = 1/4, incomplet; the 0 counts (average 0,00)"), a1h.includes('data-average-count="1/4"') && a1h.includes("data-incomplete") && a1h.includes(">0,00<"));
    // (The last rows of a table can be streamed later in the document: look anywhere for a3's only count.)
    check(label("a3 nothing yet: 0/3 shown, incomplet"), avg.html.includes('data-average-count="0/3"'));
    const yearView = await page("dirA", `/fr/grades/averages?year=${f.year}&class=${cA}&period=year`);
    check(label("the year tab shows no counts"), yearView.status === 200 && !yearView.html.includes("data-average-count="));

    // --- Grade sheet --------------------------------------------------------------------------------
    const sheet = await page("tchA", `/fr/grades?class=${cA}&subject=${maths}&period=${S1.id}`);
    check(label("teacher's sheet: count next to the saved average + incomplet for a2"),
      sheet.html.includes('data-sheet-count="· 3/3"') && sheet.html.includes('data-sheet-count="· 2/3"') && sheet.html.includes("data-incomplete"));
    check(label("…the empty / abs / 0 hint (absent left out at this level)"),
      sheet.html.includes("data-sheet-hint") && sheet.html.includes("abs = absent (hors moyenne)"));
    await admin.from("grade_level_settings").update({ absent_as_zero: true }).eq("academic_year_id", f.year).eq("level_id", f.college);
    const zero = await page("tchA", `/fr/grades?class=${cA}&subject=${maths}&period=${S1.id}`);
    check(label("…absent counted as 0 at this level: the hint says so, abs still counts as entered"),
      zero.html.includes("abs = absent (compte 0 à ce niveau)") && zero.html.includes('data-sheet-count="· 2/3"'));
    await admin.from("grade_level_settings").update({ absent_as_zero: false }).eq("academic_year_id", f.year).eq("level_id", f.college);

    // --- Lock preview ---------------------------------------------------------------------------------
    const r = await preview("dirA", S1.id, "fr");
    const gaps = r.ok ? r.data.gaps : [];
    const a2gap = gaps.find((g) => g.student.includes("Benali"));
    check(label("lock preview: every class's students with empty cells, a1 (HG 1/4), a2 (Maths 2/3, HG 0/4), a3"),
      r.ok && gaps.some((g) => g.student.includes("Alami")) && a2gap?.items.some((i) => i.entered === 2 && i.expected === 3) && gaps.some((g) => g.student.includes("Chaoui")),
      JSON.stringify(r).slice(0, 300));
    check(label("…grouped by class name"), gaps.every((g) => typeof g.group === "string" && g.group.length > 0));
    const survPreview = await preview("survA", S1.id, "fr");
    check(label("the surveillant cannot run the lock preview"), !survPreview.ok && survPreview.error === "forbidden", survPreview.error);
    const bPreview = await preview("dirB", S1.id, "fr");
    check(label("the director of B: A's semester not found"), !bPreview.ok && bPreview.error === "notFound", bPreview.error);

    // --- Row cap: 40 students × 12 subjects --------------------------------------------------------
    for (let i = 0; i < 10; i++) {
      const { data: s } = await admin.from("subjects").insert({ school_id: A.id, name: `p11gp-S${i}-${fx.run}` }).select("id").single();
      extraSubjects.push(s.id);
      await admin.from("subject_coefficients").insert({ school_id: A.id, academic_year_id: f.year, level_id: f.college, subject_id: s.id, coefficient: 1, position: 20 + i });
    }
    const { data: kids } = await admin.from("students").insert(Array.from({ length: 37 }, (_, i) => (
      { school_id: A.id, first_name: "Élève", last_name: `Zz${String(i).padStart(2, "0")} p11gp`, birth_date: "2012-01-01", gender: "male" }))).select("id");
    extraStudents.push(...kids.map((k) => k.id));
    await admin.from("student_enrollments").insert(kids.map((k) => ({ school_id: A.id, student_id: k.id, academic_year_id: f.year, class_id: cA })));
    await admin.from("grades").insert(kids.map((k) => grade(k.id, extraSubjects[9], 1, 11)));
    const big = await page("dirA", `/fr/grades/averages?year=${f.year}&class=${cA}&period=${S1.id}`);
    const rowsShown = (big.html.match(/<tr data-student="/g) ?? []).length;
    const lastSubjectCells = big.html.split(`data-average="${extraSubjects[9]}"`).length - 1;
    const elevens = (big.html.match(/>11,00</g) ?? []).length;
    check(label("a 40-student class with 12 subjects (1560 rows): 40 rows, the 12th subject in every row, its 37 marks shown"),
      rowsShown === 40 && lastSubjectCells === 40 && elevens >= 37, `${rowsShown} ${lastSubjectCells} ${elevens}`);
  } finally {
    await admin.from("grades").delete().in("student_id", [...Object.values(f.students), ...extraStudents]);
    if (extraStudents.length) await admin.from("students").delete().in("id", extraStudents);
    if (extraSubjects.length) {
      await admin.from("subject_coefficients").delete().in("subject_id", extraSubjects);
      await admin.from("subjects").delete().in("id", extraSubjects);
    }
    await f.cleanup();
  }
}
