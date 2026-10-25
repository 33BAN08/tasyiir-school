// Phase 11 step 4: save_grades(period, subject, cells) — one grade sheet in one
// transaction. Adds, changes, marks absent and clears; all or nothing; a
// teacher only their own class + subject of the current year; grades.manage
// any; the surveillant, a parent, school B and the module switch refused;
// a locked semester refuses everything.
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";
import { createGradesFixture } from "./grades-fixture.mjs";

export async function phase11SaveGrades({ fx, as }) {
  const label = (s) => `[P11 save grades] ${s}`;
  const f = await createGradesFixture(fx, "p11sg");
  const { maths, hist } = f.subjects;
  const { a1, a2, a3, b1, p1 } = f.students;
  const [S1, S2] = f.periods;
  const save = (client, cells, period = S1.id, subject = maths) =>
    client.rpc("save_grades", { p_period: period, p_subject: subject, p_cells: cells });
  const c = (student_id, number, score, extra = {}) => ({ student_id, kind: "control", number, score, absent: false, clear: false, ...extra });
  const grades = async (period = S1.id) => (await admin.from("grades")
    .select("student_id, subject_id, kind, number, score, absent, entered_by, updated_by").eq("period_id", period)
    .order("student_id").order("kind").order("number")).data ?? [];
  const find = (list, student, number, kind = "control") => list.find((g) => g.student_id === student && g.number === number && g.kind === kind);
  const refused = async (name, call, wanted) => {
    const { error } = await call;
    check(label(name), !!error && (error.code === wanted || error.message?.includes(wanted)), error ? `${error.code} ${error.message}` : "accepted!");
  };

  try {
    // --- A teacher saves their sheet -------------------------------------------------------------------
    const { data: n, error } = await save(as.tchA, [
      c(a1, 1, 14.5), c(a2, 1, 9), c(a3, 1, null, { absent: true }), c(a1, 2, 18), c(a1, 1, null, { kind: "activities", score: 16 }),
    ]);
    let list = await grades();
    check(label("the teacher saves 5 cells of their class in one call"), !error && n === 5, error?.message ?? String(n));
    check(label("…scores, absent (no score), activités, entered by the teacher"),
      Number(find(list, a1, 1)?.score) === 14.5 && find(list, a3, 1)?.absent === true && find(list, a3, 1)?.score === null
        && Number(find(list, a1, 1, "activities")?.score) === 16 && list.every((g) => g.entered_by === f.tch), JSON.stringify(list));

    const { data: n2 } = await save(as.tchA, [c(a1, 1, 15), c(a2, 1, null, { absent: true }), c(a1, 2, null, { clear: true }), c(a2, 2, null, { clear: true })]);
    list = await grades();
    check(label("change, absent and clear in one call (clearing an empty cell does nothing)"),
      n2 === 3 && Number(find(list, a1, 1)?.score) === 15 && find(list, a1, 1)?.entered_by === f.tch && find(list, a1, 1)?.updated_by === f.tch
        && find(list, a2, 1)?.absent === true && !find(list, a1, 2), `${n2} ${JSON.stringify(list)}`);

    // --- All or nothing ----------------------------------------------------------------------------------
    const before = JSON.stringify(await grades());
    await refused("one mark above /20 refuses the whole sheet", save(as.tchA, [c(a2, 2, 12), c(a3, 2, 21)]), "grade_score_above_scale");
    await refused("contrôle 3 when Maths has 2 refuses the whole sheet", save(as.tchA, [c(a2, 2, 12), c(a3, 3, 10)]), "grade_number_too_high");
    await refused("a negative mark refuses the whole sheet", save(as.tchA, [c(a2, 2, 12), c(a3, 2, -1)]), "23514");
    await refused("a student of another class in the sheet refuses the whole sheet", save(as.tchA, [c(a2, 2, 12), c(b1, 1, 10)]), "42501");
    check(label("…nothing saved by the refused sheets"), JSON.stringify(await grades()) === before);
    await refused("more than 2000 cells", save(as.tchA, Array.from({ length: 2001 }, () => c(a1, 1, 1))), "grades_too_many");

    // --- Whose sheets ------------------------------------------------------------------------------------
    await refused("a teacher cannot save another class", save(as.tchA, [c(b1, 1, 10)]), "42501");
    await refused("a teacher cannot save a subject they do not teach", save(as.tchA, [c(a1, 1, 10)], S1.id, hist), "42501");
    await refused("a teacher cannot save last year", save(as.tchA, [c(a1, 1, 10)], f.pastPeriods[0].id), "42501");
    await refused("the other teacher cannot change class A's marks", save(f.tch2.client, [c(a1, 1, 2)]), "42501");
    const { error: clearOther } = await save(f.tch2.client, [c(a1, 1, null, { clear: true })]);
    check(label("…nor clear them (nothing visible to delete)"), !clearOther && Number(find(await grades(), a1, 1)?.score) === 15);
    const { error: e2 } = await save(f.tch2.client, [c(b1, 1, 11)]);
    check(label("the other teacher saves their own class"), !e2, e2?.message);
    const { error: eDir } = await save(as.dirA, [c(b1, 2, 13), c(a1, 1, 16), c(p1, 1, 9.5)]);
    check(label("the director saves any class (and primaire /10)"), !eDir && Number(find(await grades(), a1, 1)?.score) === 16, eDir?.message);
    const { error: ePast } = await save(as.dirA, [c(a1, 1, 12)], f.pastPeriods[0].id);
    check(label("the director saves last year"), !ePast, ePast?.message);
    await refused("10,5 / 10 in primaire", save(as.dirA, [c(p1, 2, 10.5)]), "grade_score_above_scale");
    await refused("the surveillant (grades.view) cannot save", save(as.survA, [c(a1, 2, 10)]), "42501");
    await refused("a parent cannot save", save(f.parent.client, [c(a1, 1, 20)]), "42501");
    await refused("an office manager cannot save", save(as.mgrA, [c(a1, 1, 20)]), "42501");
    await refused("the director of B cannot save into A's semester", save(as.dirB, [c(a1, 1, 20)]), "grades_period_not_found");
    await refused("the platform owner cannot save", save(as.owner, [c(a1, 1, 20)]), "grades_forbidden");
    const { error: anonError } = await save(as.anon, [c(a1, 1, 20)]);
    check(label("signed out: no execute"), !!anonError, anonError?.code ?? "accepted!");
    const { data: parentRead } = await f.parent.client.from("grades").select("id").eq("student_id", a1);
    check(label("the parent still reads none of their child's grades"), (parentRead ?? []).length === 0);

    // --- Locked semester ---------------------------------------------------------------------------------
    await admin.from("grading_periods").update({ locked_at: new Date().toISOString() }).eq("id", S1.id);
    const locked = JSON.stringify(await grades());
    await refused("locked: the teacher's sheet is refused", save(as.tchA, [c(a2, 2, 12)]), "grading_period_locked");
    await refused("locked: a change is refused", save(as.tchA, [c(a1, 1, 3)]), "grading_period_locked");
    await refused("locked: a clear is refused", save(as.dirA, [c(a1, 1, null, { clear: true })]), "grading_period_locked");
    await refused("locked: the director's sheet is refused", save(as.dirA, [c(b1, 3, 12)]), "grading_period_locked");
    check(label("…nothing changed in the locked semester"), JSON.stringify(await grades()) === locked);
    if (S2) {
      const { error: open } = await save(as.tchA, [c(a1, 1, 11)], S2.id);
      check(label("locked S1: S2 still takes the teacher's sheet"), !open, open?.message);
    }
    await admin.from("grading_periods").update({ locked_at: null }).eq("id", S1.id);

    // --- Module off ---------------------------------------------------------------------------------------
    await admin.from("school_modules").update({ enabled: false }).eq("school_id", f.A.id).eq("module_key", "grades");
    await refused("module off: the director cannot save", save(as.dirA, [c(a2, 2, 12)]), "grades_forbidden");
    await admin.from("school_modules").update({ enabled: true }).eq("school_id", f.A.id).eq("module_key", "grades");
  } finally {
    await f.cleanup();
  }
}
