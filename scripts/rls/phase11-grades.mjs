// Phase 11 step 3: grades in the DB. A teacher writes only for the class +
// subject pairs they teach in this year's timetable; grades.manage (director)
// writes any; the surveillant (grades.view) reads all and writes nothing;
// parents (even of the student) and staff without a grades permission read
// nothing; a locked semester refuses every insert / update / delete (secret key
// included) except a delete cascading from a student; the trigger checks
// enrolment, subject graded at the level / filière, contrôle count, activités,
// scale; school B and the module switch.
import { randomBytes } from "node:crypto";

import { check, denied, rows } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

export async function phase11Grades({ fx, as }) {
  const A = fx.schools.a;
  const { dirA, survA, tchA, mgrA, audA, dirB, anon } = as;
  const label = (s) => `[P11 grades] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase11Grades setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (query, what) => must(await query.select("id").single(), what).id;
  const refused = async (name, query, wanted) => {
    const { error } = await query;
    const pass = Boolean(error) && (error.code === wanted || error.message?.includes(wanted));
    check(label(name), pass, error ? `${error.code} ${error.message}` : "ACCEPTED!");
  };
  const accepted = async (name, query) => {
    const { data, error } = await query;
    check(label(name), !error && (Array.isArray(data) ? data.length > 0 : Boolean(data)), error ? `${error.code} ${error.message}` : "");
    return Array.isArray(data) ? data[0] : data;
  };

  // --- Accounts: a second teacher, the parent of student 1 ----------------------------------------
  const account = async (name, roleKey) => {
    const email = `rls-test+${fx.run}-${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), name).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({
      id: user.id, school_id: A.id, role_id: A.roles[roleKey], full_name: `RLS ${name}`,
      email: roleKey === "parent" ? null : email, must_change_password: false,
    }), name);
    return { id: user.id, client: await signIn({ email, password }) };
  };
  const tch = fx.users.tchA.id;
  const { data: tchState } = await admin.from("profiles").select("must_change_password, deactivated_at").eq("id", tch).single();
  await admin.from("profiles").update({ must_change_password: false, deactivated_at: null }).eq("id", tch);
  const tch2 = await account("p11gtch2", "teacher");

  // --- The year holding today (current), its semesters ---------------------------------------------
  const now = Date.now();
  const today = iso(now);
  const { data: before } = await admin.from("academic_years").select("id").eq("school_id", A.id).eq("is_current", true).maybeSingle();
  const { data: existing } = await admin.from("academic_years").select("id")
    .eq("school_id", A.id).lte("start_date", today).gte("end_date", today).maybeSingle();
  const ownYear = !existing;
  const year = existing?.id ?? await id(admin.from("academic_years").insert({
    school_id: A.id, label: "P11g-annee", start_date: iso(now - 60 * DAY), end_date: iso(now + 200 * DAY), is_current: false,
  }), "year");
  must(await admin.from("academic_years").update({ is_current: true }).eq("id", year), "current year");
  const periods = must(await admin.from("grading_periods").select("id, number, locked_at").eq("academic_year_id", year).order("number"), "periods");
  const [S1, S2] = periods;
  const pastYear = await id(admin.from("academic_years").insert({
    school_id: A.id, label: `P11g-past-${fx.run}`, start_date: "2090-09-01", end_date: "2091-06-30", is_current: false,
  }), "past year");
  const [P1] = must(await admin.from("grading_periods").select("id").eq("academic_year_id", pastYear).order("number"), "past periods");

  // --- Structure: college level (/20, 3 contrôles, activités) with a filière, a primaire level (/10) ----
  const { data: monday } = await admin.from("school_days").select("day_of_week").eq("academic_year_id", year).eq("day_of_week", 1).maybeSingle();
  if (!monday) must(await admin.from("school_days").insert({ school_id: A.id, academic_year_id: year, day_of_week: 1 }), "day");
  must(await admin.from("school_days").insert({ school_id: A.id, academic_year_id: pastYear, day_of_week: 1 }), "past day");
  const slot = await id(admin.from("time_slots").insert({
    school_id: A.id, academic_year_id: year, day_of_week: 1, start_time: "22:40", end_time: "23:00", kind: "lesson",
  }), "slot");
  const pastSlot = await id(admin.from("time_slots").insert({
    school_id: A.id, academic_year_id: pastYear, day_of_week: 1, start_time: "22:40", end_time: "23:00", kind: "lesson",
  }), "past slot");
  const college = await id(admin.from("levels").insert({ school_id: A.id, name: `P11g-3AC-${fx.run}`, cycle: "college" }), "college");
  const primaire = await id(admin.from("levels").insert({ school_id: A.id, name: `P11g-CE1-${fx.run}`, cycle: "primaire" }), "primaire");
  const track = await id(admin.from("tracks").insert({ school_id: A.id, level_id: college, name: `P11g-SM-${fx.run}` }), "track");
  const klass = (y, level, name, trackId = null) =>
    id(admin.from("classes").insert({ school_id: A.id, academic_year_id: y, level_id: level, track_id: trackId, name: `${name}-${fx.run}` }), name);
  const c1 = await klass(year, college, "P11g-A");
  const c2 = await klass(year, college, "P11g-B");
  const c3 = await klass(year, college, "P11g-SM", track);
  const cp = await klass(year, primaire, "P11g-CE1");
  const cPast = await klass(pastYear, college, "P11g-old");
  const subject = (name) => id(admin.from("subjects").insert({ school_id: A.id, name: `${name}-${fx.run}` }), name);
  const maths = await subject("P11g-Maths");
  const hist = await subject("P11g-HG");
  const pc = await subject("P11g-PC");
  const subjects = [maths, hist, pc];
  for (const y of [year, pastYear]) {
    must(await admin.from("grade_level_settings").insert({ school_id: A.id, academic_year_id: y, level_id: college, scale: 20, controls_count: 3, activities: true }), "rules");
  }
  const coef = (values) => admin.from("subject_coefficients").insert({ school_id: A.id, coefficient: 1, ...values });
  must(await coef({ academic_year_id: year, level_id: college, subject_id: maths, controls_count: 2 }), "maths");
  must(await coef({ academic_year_id: year, level_id: college, subject_id: hist }), "hist");
  must(await coef({ academic_year_id: year, level_id: college, track_id: track, subject_id: pc }), "pc filière");
  must(await coef({ academic_year_id: year, level_id: primaire, subject_id: maths }), "maths primaire");
  must(await coef({ academic_year_id: pastYear, level_id: college, subject_id: maths }), "maths past");
  for (const t of [tch, tch2.id]) {
    must(await dirA.from("teacher_subjects").insert({ school_id: A.id, teacher_id: t, subject_id: maths }), "teaches maths");
  }
  const lesson = (y, s, c, t, sub = maths) =>
    id(admin.from("lessons").insert({ school_id: A.id, academic_year_id: y, time_slot_id: s, class_id: c, subject_id: sub, teacher_id: t }), "lesson");
  const lessons = [
    await lesson(year, slot, c1, tch), //            tchA teaches Maths to A
    await lesson(year, slot, c2, tch2.id), //        tch2 teaches Maths to B
    await lesson(pastYear, pastSlot, cPast, tch), // tchA taught Maths last time too (not current)
  ];

  const students = [];
  const guardians = [];
  const kid = async (name, enrolments) => {
    const s = await id(admin.from("students").insert({ school_id: A.id, first_name: "Kid", last_name: name, birth_date: "2012-01-01", gender: "female" }), name);
    students.push(s);
    for (const [y, c] of enrolments) {
      must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: s, academic_year_id: y, class_id: c }), "enrol");
    }
    return s;
  };
  const s1 = await kid("p11gkid1", [[year, c1], [pastYear, cPast]]);
  const s2 = await kid("p11gkid2", [[year, c2]]);
  const s3 = await kid("p11gkid3", [[year, c3]]);
  const sP = await kid("p11gkid4", [[year, cp]]);
  const sGone = await kid("p11gkid5", [[year, c1]]);
  const sNone = await kid("p11gkid6", []);
  const parent = await account("p11gpar", "parent");
  const g = await id(admin.from("guardians").insert({ school_id: A.id, last_name: "P11g", first_name: "Parent", phone: randomMobile(), profile_id: parent.id }), "guardian");
  guardians.push(g);
  must(await admin.from("student_guardians").insert({ school_id: A.id, student_id: s1, guardian_id: g, relation: "mother" }), "link");

  const grade = (client, values) => client.from("grades")
    .insert({ school_id: A.id, period_id: S1.id, subject_id: maths, kind: "control", number: 1, score: 12, ...values })
    .select("id, academic_year_id, entered_by, score");
  const gradeRow = async (gid) => (await admin.from("grades").select("*").eq("id", gid).maybeSingle()).data;

  try {
    // --- 1. Teachers: own class + subject pairs of the current year ----------------------------------------
    const g1 = await accepted("a teacher grades a student of a class + subject they teach", grade(tchA, { student_id: s1, score: 14.5 }));
    check(label("…the year comes from the semester, the teacher is recorded"),
      g1?.academic_year_id === year && g1?.entered_by === tch && Number(g1?.score) === 14.5, JSON.stringify(g1));
    await refused("a teacher cannot grade a class they do not teach", grade(tchA, { student_id: s2 }), "42501");
    await refused("a teacher cannot grade a subject they do not teach to that class", grade(tchA, { student_id: s1, subject_id: hist }), "42501");
    await refused("another teacher cannot grade class A", grade(tch2.client, { student_id: s1, number: 2 }), "42501");
    const g2 = await accepted("the second teacher grades their own class", grade(tch2.client, { student_id: s2 }));
    await refused("a teacher cannot grade last year, even their own class", grade(tchA, { student_id: s1, period_id: P1.id }), "42501");
    await refused("the year cannot be chosen by the caller",
      tchA.from("grades").insert({ school_id: A.id, academic_year_id: pastYear, period_id: S1.id, student_id: s1, subject_id: maths, number: 2, score: 1 }), "42501");
    await refused("who entered it cannot be chosen",
      tchA.from("grades").insert({ school_id: A.id, period_id: S1.id, student_id: s1, subject_id: maths, number: 2, score: 1, entered_by: tch2.id }), "42501");

    // --- 2. Director (grades.manage): any grade, any year ------------------------------------------------
    await accepted("the director grades any class", grade(dirA, { student_id: s2, number: 2, score: 9 }));
    await accepted("the director grades last year", grade(dirA, { student_id: s1, period_id: P1.id, score: 11 }));
    await accepted("the director grades a filière subject for a student of that filière", grade(dirA, { student_id: s3, subject_id: pc }));
    await accepted("an absent contrôle (no score)", grade(dirA, { student_id: s1, subject_id: hist, absent: true, score: null }));
    await accepted("activités intégrées on a level that has them", grade(dirA, { student_id: s1, kind: "activities", score: 16 }));
    await accepted("contrôle 3 of a subject with the level's 3", grade(dirA, { student_id: s1, subject_id: hist, number: 3, score: 10 }));
    await accepted("9,5 / 10 in primaire", grade(dirA, { student_id: sP, score: 9.5 }));

    // --- 3. What the trigger and the checks refuse ---------------------------------------------------------
    await refused("a filière subject for a student outside the filière", grade(dirA, { student_id: s1, subject_id: pc }), "grade_subject_not_graded");
    await refused("a student not enrolled this year", grade(dirA, { student_id: sNone }), "grade_student_not_enrolled");
    await refused("contrôle 3 when the subject has 2", grade(dirA, { student_id: s1, number: 3 }), "grade_number_too_high");
    await refused("contrôle 4 when the level has 3", grade(dirA, { student_id: s1, subject_id: hist, number: 4 }), "grade_number_too_high");
    await refused("activités on a level without them", grade(dirA, { student_id: sP, kind: "activities" }), "grade_no_activities");
    await refused("12 / 10 in primaire", grade(dirA, { student_id: sP, number: 2, score: 12 }), "grade_score_above_scale");
    await refused("21 / 20", grade(dirA, { student_id: s2, number: 1, subject_id: hist, score: 21 }), "grade_score_above_scale");
    await refused("a negative score", grade(dirA, { student_id: s2, number: 1, subject_id: hist, score: -1 }), "23514");
    await refused("absent with a score", grade(dirA, { student_id: s2, number: 1, subject_id: hist, absent: true, score: 5 }), "23514");
    await refused("no score and not absent", grade(dirA, { student_id: s2, number: 1, subject_id: hist, score: null }), "23514");
    await refused("activités numbered 2", grade(dirA, { student_id: s1, kind: "activities", number: 2 }), "23514");
    await refused("an unknown kind", grade(dirA, { student_id: s1, kind: "exam" }), "23514");
    await refused("the same contrôle twice", grade(dirA, { student_id: s1 }), "23505");

    // --- 4. Who reads -----------------------------------------------------------------------------------
    const mine = (list) => list.length > 0 && list.every((r) => r.student_id === s1 && r.subject_id === maths && r.academic_year_id === year);
    await rows(label("the teacher reads only their own pairs of this year"), tchA.from("grades").select("student_id, subject_id, academic_year_id"), mine);
    await rows(label("the second teacher reads only class B's Maths"),
      tch2.client.from("grades").select("student_id"), (list) => list.length === 2 && list.every((r) => r.student_id === s2));
    const all = (await admin.from("grades").select("id").eq("school_id", A.id)).data.length;
    await rows(label("the director reads every grade"), dirA.from("grades").select("id"), all);
    await rows(label("the surveillant (grades.view) reads every grade"), survA.from("grades").select("id"), all);
    await rows(label("the parent of the student reads none of their child's grades"),
      parent.client.from("grades").select("id").eq("student_id", s1), 0);
    await rows(label("…nor any grade at all"), parent.client.from("grades").select("id"), 0);
    await rows(label("an office manager (no grades permission) reads nothing"), mgrA.from("grades").select("id"), 0);
    await rows(label("an auditor (no grades permission) reads nothing"), audA.from("grades").select("id"), 0);
    await rows(label("the director of B reads none of A's grades"), dirB.from("grades").select("id").eq("school_id", A.id), 0);
    const { data: anonRows, error: anonError } = await anon.from("grades").select("id");
    check(label("signed out: nothing (no grant)"), anonError?.code === "42501" || anonRows?.length === 0, anonError?.code ?? `${anonRows?.length}`);

    // --- 5. Who changes and deletes ---------------------------------------------------------------------
    await refused("the surveillant cannot grade", grade(survA, { student_id: s1, number: 2 }), "42501");
    await denied(label("the surveillant cannot change a grade"), survA.from("grades").update({ score: 20 }).eq("id", g1.id).select("id"));
    await denied(label("the surveillant cannot delete a grade"), survA.from("grades").delete().eq("id", g1.id).select("id"));
    await denied(label("a parent cannot change their child's grade"), parent.client.from("grades").update({ score: 20 }).eq("id", g1.id).select("id"));
    await denied(label("a parent cannot delete their child's grade"), parent.client.from("grades").delete().eq("id", g1.id).select("id"));
    await refused("a parent cannot add a grade", grade(parent.client, { student_id: s1, number: 2 }), "42501");
    await denied(label("the director of B cannot change A's grade"), dirB.from("grades").update({ score: 20 }).eq("id", g1.id).select("id"));
    const changed = await accepted("the teacher corrects their own grade",
      tchA.from("grades").update({ score: 15 }).eq("id", g1.id).select("score, updated_by"));
    check(label("…who changed it recorded"), Number(changed?.score) === 15 && changed?.updated_by === tch);
    await denied(label("the teacher cannot change another class's grade"), tchA.from("grades").update({ score: 1 }).eq("id", g2.id).select("id"));
    await refused("the teacher cannot move a grade to another student", tchA.from("grades").update({ student_id: s2 }).eq("id", g1.id).select("id"), "42501");
    await refused("the secret key cannot move a grade to another student",
      admin.from("grades").update({ student_id: s2 }).eq("id", g1.id), "grade_identity_locked");
    await refused("a correction above the scale", dirA.from("grades").update({ score: 25 }).eq("id", g1.id).select("id"), "grade_score_above_scale");
    await accepted("the director marks the grade absent", dirA.from("grades").update({ score: null, absent: true }).eq("id", g1.id).select("id"));
    await denied(label("the teacher cannot delete another class's grade"), tchA.from("grades").delete().eq("id", g2.id).select("id"));
    await accepted("the second teacher deletes their own grade", tch2.client.from("grades").delete().eq("id", g2.id).select("id"));

    // --- 6. Locked semester: nothing changes, whoever asks ------------------------------------------------
    const gGone = await accepted("a grade for a student about to leave", grade(dirA, { student_id: sGone }));
    must(await admin.from("grading_periods").update({ locked_at: new Date().toISOString() }).eq("id", S1.id), "lock S1");
    await refused("locked: the teacher cannot add a grade", grade(tchA, { student_id: s1, number: 2 }), "grading_period_locked");
    await refused("locked: the director cannot add a grade", grade(dirA, { student_id: s2, number: 1 }), "grading_period_locked");
    await refused("locked: the teacher cannot correct", tchA.from("grades").update({ score: 3 }).eq("id", g1.id).select("id"), "grading_period_locked");
    await refused("locked: the director cannot correct", dirA.from("grades").update({ score: 3 }).eq("id", g1.id).select("id"), "grading_period_locked");
    await refused("locked: the director cannot delete", dirA.from("grades").delete().eq("id", g1.id).select("id"), "grading_period_locked");
    await refused("locked: the secret key cannot add",
      admin.from("grades").insert({ school_id: A.id, period_id: S1.id, student_id: s2, subject_id: maths, number: 1, score: 1 }), "grading_period_locked");
    await refused("locked: the secret key cannot correct", admin.from("grades").update({ score: 3 }).eq("id", g1.id), "grading_period_locked");
    await refused("locked: the secret key cannot delete", admin.from("grades").delete().eq("id", g1.id), "grading_period_locked");
    must(await admin.from("students").delete().eq("id", sGone), "student leaves");
    check(label("locked: deleting a student still removes their grades (cascade)"), (await gradeRow(gGone.id)) === null);
    if (S2) await accepted("locked S1: the other semester stays open", grade(tchA, { student_id: s1, period_id: S2.id }));
    must(await admin.from("grading_periods").update({ locked_at: null }).eq("id", S1.id), "unlock S1");
    await accepted("unlocked: the director can correct again", dirA.from("grades").update({ score: 13, absent: false }).eq("id", g1.id).select("id"));

    // --- 7. What cannot be deleted while it has grades ----------------------------------------------------
    await refused("a semester with grades cannot be deleted", admin.from("grading_periods").delete().eq("id", S1.id), "23503");
    await refused("a subject with grades cannot be deleted", admin.from("subjects").delete().eq("id", hist), "23503");

    // --- 8. Module off ------------------------------------------------------------------------------------
    must(await admin.from("school_modules").update({ enabled: false }).eq("school_id", A.id).eq("module_key", "grades"), "module off");
    await rows(label("module off: the director reads nothing"), dirA.from("grades").select("id"), 0);
    await rows(label("module off: the teacher reads nothing"), tchA.from("grades").select("id"), 0);
    await refused("module off: the director cannot grade", grade(dirA, { student_id: s1, number: 2 }), "42501");
    must(await admin.from("school_modules").update({ enabled: true }).eq("school_id", A.id).eq("module_key", "grades"), "module on");
  } finally {
    // --- Cleanup (deleting the students removes their grades, locked semester or not) -----------------------
    await admin.from("school_modules").update({ enabled: true }).eq("school_id", A.id).eq("module_key", "grades");
    await admin.from("grading_periods").update({ locked_at: S1.locked_at }).eq("id", S1.id);
    await admin.from("student_guardians").delete().in("student_id", students);
    await admin.from("guardians").delete().in("id", guardians);
    await admin.from("students").delete().in("id", students);
    await admin.from("lessons").delete().in("id", lessons);
    await admin.from("teacher_subjects").delete().eq("subject_id", maths);
    await admin.from("classes").delete().in("id", [c1, c2, c3, cp, cPast]);
    await admin.from("time_slots").delete().in("id", [slot, pastSlot]);
    if (!monday) await admin.from("school_days").delete().eq("academic_year_id", year).eq("day_of_week", 1);
    await admin.from("subject_coefficients").delete().in("subject_id", subjects);
    await admin.from("grade_level_settings").delete().in("level_id", [college, primaire]);
    await admin.from("subjects").delete().in("id", subjects);
    await admin.from("levels").delete().in("id", [college, primaire]);
    await admin.from("academic_years").delete().eq("id", pastYear);
    if (before && before.id !== year) await admin.from("academic_years").update({ is_current: true }).eq("id", before.id);
    else if (!before) await admin.from("academic_years").update({ is_current: false }).eq("id", year);
    if (ownYear) await admin.from("academic_years").delete().eq("id", year);
    await admin.from("profiles").update({ must_change_password: tchState.must_change_password, deactivated_at: tchState.deactivated_at }).eq("id", tch);
  }
}
