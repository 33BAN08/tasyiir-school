// Phase 11 step 5: class_averages(class) — subject / general averages per
// semester and per year, rank, class figures. Every expected number below is
// worked out by hand from the defaults (activités = one more contrôle, absent
// left out, 2 decimals rounded, ties share the rank) and then from each rule
// changed in grade_level_settings. Also: a filière's coefficient wins, a mark
// beyond a lowered count still counts, a teacher gets only their subject rows,
// everyone else outside grades.view / manage is refused.
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";
import { createGradesFixture } from "./grades-fixture.mjs";

export async function phase11Averages({ fx, as }) {
  const label = (s) => `[P11 averages] ${s}`;
  const f = await createGradesFixture(fx, "p11av");
  const A = f.A;
  const { maths, hist } = f.subjects;
  const { a1, a2, a3 } = f.students;
  const { cA, cP } = f.classes;
  const [S1, S2] = f.periods;
  const must = (r, what) => {
    if (r.error) throw new Error(`averages fixture: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const extra = { students: [], classes: [], tracks: [] };
  const weights = must(await admin.from("grading_periods").select("id, weight").eq("academic_year_id", f.year), "weights");

  const rules = (values) => admin.from("grade_level_settings").update(values)
    .eq("academic_year_id", f.year).eq("level_id", f.college);
  const defaults = { activities_weight: 1, absent_as_zero: false, rounding: "round", ranking: "shared" };
  const grade = (student, period, subject, number, score, kind = "control") =>
    ({ school_id: A.id, period_id: period, student_id: student, subject_id: subject, kind, number,
       score: score === "abs" ? null : score, absent: score === "abs" });
  const run = async (client = as.dirA, klass = cA) => client.rpc("class_averages", { p_class: klass });
  const pick = (rows, student, period, subject) =>
    rows.find((r) => r.student_id === student && r.period_id === period && r.subject_id === subject);
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  const avg = (rows, student, period, subject) => num(pick(rows, student, period, subject)?.average);
  const refused = async (name, call, wanted) => {
    const { error } = await call;
    check(label(name), !!error && (error.code === wanted || error.message?.includes(wanted)), error ? `${error.code} ${error.message}` : "accepted!");
  };

  try {
    must(await admin.from("grading_periods").update({ weight: 1 }).eq("academic_year_id", f.year), "weights 1");
    must(await rules(defaults), "defaults");
    must(await admin.from("subject_coefficients").update({ coefficient: 2 }).eq("academic_year_id", f.year)
      .eq("level_id", f.college).eq("subject_id", maths), "maths coef 2");
    must(await admin.from("subject_coefficients").update({ coefficient: 3 }).eq("academic_year_id", f.year)
      .eq("level_id", f.college).eq("subject_id", hist), "hg coef 3");

    // A fourth student of class A, and a filière class with one student.
    const a4 = must(await admin.from("students").insert({ school_id: A.id, first_name: "Nour", last_name: "Zahiri p11av", birth_date: "2012-01-01", gender: "female" }).select("id").single(), "a4").id;
    extra.students.push(a4);
    must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: a4, academic_year_id: f.year, class_id: cA }), "a4 enrol");
    const track = must(await admin.from("tracks").insert({ school_id: A.id, level_id: f.college, name: `p11av-SM-${fx.run}` }).select("id").single(), "track").id;
    extra.tracks.push(track);
    const cT = must(await admin.from("classes").insert({ school_id: A.id, academic_year_id: f.year, level_id: f.college, track_id: track, name: `p11av-T-${fx.run}` }).select("id").single(), "class T").id;
    extra.classes.push(cT);
    const t1 = must(await admin.from("students").insert({ school_id: A.id, first_name: "Taha", last_name: "Filiere p11av", birth_date: "2012-01-01", gender: "male" }).select("id").single(), "t1").id;
    extra.students.push(t1);
    must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: t1, academic_year_id: f.year, class_id: cT }), "t1 enrol");
    must(await admin.from("subject_coefficients").insert({ school_id: A.id, academic_year_id: f.year, level_id: f.college, track_id: track, subject_id: hist, coefficient: 5 }), "filière hg");

    // Marks (Maths: 2 contrôles + activités, HG: 3 contrôles + activités).
    must(await admin.from("grades").insert([
      grade(a1, S1.id, maths, 1, 14), grade(a1, S1.id, maths, 2, "abs"), grade(a1, S1.id, maths, 1, 17, "activities"),
      grade(a1, S1.id, hist, 1, 12), grade(a1, S1.id, hist, 2, 13), grade(a1, S1.id, hist, 3, 10),
      grade(a2, S1.id, maths, 1, 10), grade(a2, S1.id, maths, 2, 11), grade(a2, S1.id, hist, 1, 16),
      grade(a3, S1.id, maths, 1, 13.2),
      grade(a4, S1.id, maths, 1, 10), grade(a4, S1.id, hist, 1, 10),
      grade(a1, S2.id, maths, 1, 16), grade(a1, S2.id, hist, 1, 14),
      grade(a3, S2.id, maths, 1, 9), grade(a3, S2.id, hist, 1, 9),
      grade(t1, S1.id, maths, 1, 10), grade(t1, S1.id, hist, 1, 20),
    ]), "marks");
    // A 3rd Maths contrôle entered while Maths had 3, then the count lowered to 2: it still counts.
    must(await admin.from("subject_coefficients").update({ controls_count: 3 }).eq("academic_year_id", f.year).eq("level_id", f.college).eq("subject_id", maths), "maths 3");
    must(await admin.from("grades").insert(grade(a2, S2.id, maths, 3, 12)), "old mark");
    must(await admin.from("subject_coefficients").update({ controls_count: 2 }).eq("academic_year_id", f.year).eq("level_id", f.college).eq("subject_id", maths), "maths 2");

    // --- Defaults ----------------------------------------------------------------------------------------
    const { data: rows, error } = await run();
    check(label("the director gets the class's averages"), !error && (rows ?? []).length > 0, error?.message);
    const R = rows ?? [];
    check(label("rows: 4 students × (2 semesters + year) × (2 subjects + general) = 36"), R.length === 36, String(R.length));
    const m1 = pick(R, a1, S1.id, maths);
    check(label("Maths S1: (14 + activités 17) / 2 = 15.50, the absent contrôle left out"),
      num(m1?.average) === 15.5 && m1?.marks === 2 && m1?.absences === 1 && num(m1?.coefficient) === 2, JSON.stringify(m1));
    check(label("HG S1: 35 / 3 = 11.67 (rounded)"), avg(R, a1, S1.id, hist) === 11.67);
    check(label("general S1: (2 × 15.50 + 3 × 11.67) / 5 = 13.20"), avg(R, a1, S1.id, null) === 13.2);
    check(label("general S1 of a2: (2 × 10.50 + 3 × 16) / 5 = 13.80"), avg(R, a2, S1.id, null) === 13.8);
    const g3 = pick(R, a3, S1.id, null);
    check(label("a subject with no mark is left out and flagged: a3 S1 = Maths alone 13.20, missing 1"),
      num(g3?.average) === 13.2 && g3?.missing === 1 && avg(R, a3, S1.id, hist) === null, JSON.stringify(g3));
    const rS1 = (s) => pick(R, s, S1.id, null)?.rank;
    check(label("ties share the rank, the next is skipped: 1, 2, 2, 4"),
      rS1(a2) === 1 && rS1(a1) === 2 && rS1(a3) === 2 && rS1(a4) === 4, [a2, a1, a3, a4].map(rS1).join());
    const gS1 = pick(R, a1, S1.id, null);
    check(label("class figures S1: ranked 4, average 12.55, min 10, max 13.80"),
      gS1?.ranked === 4 && num(gS1?.class_average) === 12.55 && num(gS1?.class_min) === 10 && num(gS1?.class_max) === 13.8, JSON.stringify(gS1));
    check(label("subject rank too: Maths S1 a1 15.50 first"), pick(R, a1, S1.id, maths)?.rank === 1);
    check(label("a mark beyond a lowered contrôle count still counts: a2 Maths S2 = 12"), avg(R, a2, S2.id, maths) === 12);
    const n2 = pick(R, a2, S2.id, null);
    check(label("a2 general S2 = 12.00 with HG missing"), num(n2?.average) === 12 && n2?.missing === 1, JSON.stringify(n2));
    const n4 = pick(R, a4, S2.id, null);
    check(label("no mark at all in S2: no average, no rank, missing 2"),
      n4?.average === null && n4?.rank === null && n4?.missing === 2 && pick(R, a1, S2.id, null)?.ranked === 3, JSON.stringify(n4));
    check(label("subject for the year: Maths (15.50 + 16) / 2 = 15.75, HG (11.67 + 14) / 2 = 12.84"),
      avg(R, a1, null, maths) === 15.75 && avg(R, a1, null, hist) === 12.84);
    check(label("general for the year = (S1 + S2) / 2: a1 (13.20 + 14.80) / 2 = 14.00"),
      avg(R, a1, S2.id, null) === 14.8 && avg(R, a1, null, null) === 14);
    const y4 = pick(R, a4, null, null);
    check(label("year with one semester only: a4 = its S1 average 10.00, missing 1"), num(y4?.average) === 10 && y4?.missing === 1, JSON.stringify(y4));
    const rY = (s) => pick(R, s, null, null)?.rank;
    check(label("year ranks: a1 14.00, a2 12.90, a3 11.10, a4 10.00"),
      avg(R, a2, null, null) === 12.9 && avg(R, a3, null, null) === 11.1 && [a1, a2, a3, a4].map(rY).join() === "1,2,3,4", [a1, a2, a3, a4].map(rY).join());

    const { data: tRows } = await run(as.dirA, cT);
    check(label("a filière's coefficient wins: (2 × 10 + 5 × 20) / 7 = 17.14, coefficient 5 shown"),
      avg(tRows ?? [], t1, S1.id, null) === 17.14 && num(pick(tRows ?? [], t1, S1.id, hist)?.coefficient) === 5, JSON.stringify(tRows?.slice(0, 3)));
    const { data: pRows } = await run(as.dirA, cP);
    const p1 = pick(pRows ?? [], f.students.p1, S1.id, null);
    check(label("a class with no marks: every average empty, no rank"),
      (pRows ?? []).length > 0 && (pRows ?? []).every((r) => r.average === null && r.rank === null) && p1?.missing === 1, JSON.stringify(p1));

    // --- Rules changed per level -------------------------------------------------------------------------
    const again = async (values) => { must(await rules({ ...defaults, ...values }), "rules"); return (await run()).data ?? []; };
    let C = await again({ activities_weight: 2 });
    check(label("activités worth 2 contrôles: (14 + 2 × 17) / 3 = 16.00"), avg(C, a1, S1.id, maths) === 16);
    C = await again({ absent_as_zero: true });
    const z = pick(C, a1, S1.id, maths);
    check(label("absent counted as 0: (14 + 0 + 17) / 3 = 10.33, 3 marks counted"), num(z?.average) === 10.33 && z?.marks === 3, JSON.stringify(z));
    C = await again({ rounding: "truncate" });
    check(label("truncated: HG 35 / 3 = 11.66"), avg(C, a1, S1.id, hist) === 11.66);
    C = await again({ ranking: "dense" });
    const d = (s) => pick(C, s, S1.id, null)?.rank;
    check(label("dense ranking: 1, 2, 2, 3"), [a2, a1, a3, a4].map(d).join() === "1,2,2,3", [a2, a1, a3, a4].map(d).join());
    must(await rules(defaults), "defaults back");
    const { data: rulesRows } = await as.dirA.rpc("grade_level_rules", { p_year: f.year });
    const prim = (rulesRows ?? []).find((r) => r.level_id === f.primaire);
    check(label("grade_level_rules: defaults for a level without a row (1, false, round, shared)"),
      Number(prim?.activities_weight) === 1 && prim?.absent_as_zero === false && prim?.rounding === "round" && prim?.ranking === "shared", JSON.stringify(prim));
    const { error: badRule } = await as.dirA.from("grade_level_settings").update({ rounding: "ceil" }).eq("academic_year_id", f.year).eq("level_id", f.college);
    check(label("an unknown rounding is refused"), badRule?.message?.includes("rounding_check") ?? false, badRule?.message ?? "accepted!");
    const { error: badWeight } = await as.dirA.from("grade_level_settings").update({ activities_weight: 0 }).eq("academic_year_id", f.year).eq("level_id", f.college);
    check(label("activités weight 0 is refused"), !!badWeight, "accepted!");
    const { error: survRule } = await as.survA.from("grade_level_settings").update({ ranking: "dense" }).eq("academic_year_id", f.year).eq("level_id", f.college).select("level_id");
    const { data: after } = await admin.from("grade_level_settings").select("ranking").eq("academic_year_id", f.year).eq("level_id", f.college).single();
    check(label("the surveillant cannot change the rules"), after?.ranking === "shared", survRule?.message ?? "");

    // --- Who reads -------------------------------------------------------------------------------------
    const { data: sRows, error: sErr } = await run(as.survA);
    check(label("the surveillant (grades.view) gets the same rows"), !sErr && JSON.stringify(sRows) === JSON.stringify(R), sErr?.message);
    const { data: tch, error: tErr } = await run(as.tchA);
    check(label("the teacher of Maths in A gets only the Maths rows, no general average"),
      !tErr && (tch ?? []).length === 12 && (tch ?? []).every((r) => r.subject_id === maths), tErr?.message ?? String(tch?.length));
    check(label("…with the same numbers and the subject rank"),
      avg(tch ?? [], a1, S1.id, maths) === 15.5 && pick(tch ?? [], a1, S1.id, maths)?.rank === 1);
    await refused("a teacher without a lesson in the class is refused", run(f.tch2.client), "averages_forbidden");
    await refused("a parent is refused", run(f.parent.client), "averages_forbidden");
    await refused("an office manager is refused", run(as.mgrA), "averages_forbidden");
    await refused("the director of B: class not found", run(as.dirB), "averages_class_not_found");
    await refused("the platform owner is refused", run(as.owner), "averages_forbidden");
    const { error: anonErr } = await run(as.anon);
    check(label("signed out: no execute"), !!anonErr, anonErr?.code ?? "accepted!");
    await admin.from("school_modules").update({ enabled: false }).eq("school_id", A.id).eq("module_key", "grades");
    await refused("grades module off: refused", run(), "averages_forbidden");
    await admin.from("school_modules").update({ enabled: true }).eq("school_id", A.id).eq("module_key", "grades");
  } finally {
    for (const w of weights) await admin.from("grading_periods").update({ weight: w.weight }).eq("id", w.id);
    await admin.from("grades").delete().in("student_id", [...Object.values(f.students), ...extra.students]);
    await admin.from("students").delete().in("id", extra.students);
    await admin.from("subject_coefficients").delete().in("track_id", extra.tracks);
    await admin.from("classes").delete().in("id", extra.classes);
    await admin.from("tracks").delete().in("id", extra.tracks);
    await f.cleanup();
  }
}
