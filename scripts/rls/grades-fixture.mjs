// Shared set-up of the Phase 11 grade-sheet suites (save_grades, the /grades
// page and its action): school A's year holding today made current, a past
// year, a college level (/20, 3 contrôles, activités) and a primaire level,
// classes A (taught Maths by tchA) and B (by a second teacher), the semesters,
// students, the parent of student 1. `cleanup()` puts everything back.
import { randomBytes } from "node:crypto";

import { admin, signIn } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

export async function createGradesFixture(fx, tag) {
  const A = fx.schools.a;
  const must = (r, what) => {
    if (r.error) throw new Error(`grades fixture (${tag}): ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (query, what) => must(await query.select("id").single(), what).id;
  const done = [];

  const account = async (name, roleKey) => {
    const email = `rls-test+${fx.run}-${tag}${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), name).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({
      id: user.id, school_id: A.id, role_id: A.roles[roleKey], full_name: `RLS ${tag}${name}`,
      email: roleKey === "parent" ? null : email, must_change_password: false,
    }), name);
    return { id: user.id, email, password, client: await signIn({ email, password }) };
  };

  const tch = fx.users.tchA.id;
  const { data: tchState } = await admin.from("profiles").select("must_change_password, deactivated_at").eq("id", tch).single();
  await admin.from("profiles").update({ must_change_password: false, deactivated_at: null }).eq("id", tch);
  const tch2 = await account("tch2", "teacher");
  const parent = await account("par", "parent");

  const now = Date.now();
  const today = iso(now);
  const { data: before } = await admin.from("academic_years").select("id").eq("school_id", A.id).eq("is_current", true).maybeSingle();
  const { data: existing } = await admin.from("academic_years").select("id")
    .eq("school_id", A.id).lte("start_date", today).gte("end_date", today).maybeSingle();
  const ownYear = !existing;
  const year = existing?.id ?? await id(admin.from("academic_years").insert({
    school_id: A.id, label: `${tag}-annee`, start_date: iso(now - 60 * DAY), end_date: iso(now + 200 * DAY), is_current: false,
  }), "year");
  must(await admin.from("academic_years").update({ is_current: true }).eq("id", year), "current year");
  const periods = must(await admin.from("grading_periods").select("id, number, locked_at").eq("academic_year_id", year).order("number"), "periods");
  const pastYear = await id(admin.from("academic_years").insert({
    school_id: A.id, label: `${tag}-past-${fx.run}`, start_date: "2091-09-01", end_date: "2092-06-30", is_current: false,
  }), "past year");
  const pastPeriods = must(await admin.from("grading_periods").select("id, number").eq("academic_year_id", pastYear).order("number"), "past periods");

  const { data: monday } = await admin.from("school_days").select("day_of_week").eq("academic_year_id", year).eq("day_of_week", 1).maybeSingle();
  if (!monday) must(await admin.from("school_days").insert({ school_id: A.id, academic_year_id: year, day_of_week: 1 }), "day");
  must(await admin.from("school_days").insert({ school_id: A.id, academic_year_id: pastYear, day_of_week: 1 }), "past day");
  const slot = await id(admin.from("time_slots").insert({
    school_id: A.id, academic_year_id: year, day_of_week: 1, start_time: "23:20", end_time: "23:40", kind: "lesson",
  }), "slot");
  const pastSlot = await id(admin.from("time_slots").insert({
    school_id: A.id, academic_year_id: pastYear, day_of_week: 1, start_time: "23:20", end_time: "23:40", kind: "lesson",
  }), "past slot");
  const college = await id(admin.from("levels").insert({ school_id: A.id, name: `${tag}-3AC-${fx.run}`, cycle: "college" }), "college");
  const primaire = await id(admin.from("levels").insert({ school_id: A.id, name: `${tag}-CE1-${fx.run}`, cycle: "primaire" }), "primaire");
  const klass = (y, level, name) =>
    id(admin.from("classes").insert({ school_id: A.id, academic_year_id: y, level_id: level, name: `${tag}-${name}-${fx.run}` }), name);
  const cA = await klass(year, college, "A");
  const cB = await klass(year, college, "B");
  const cP = await klass(year, primaire, "P");
  const cPast = await klass(pastYear, college, "old");
  const subject = (name) => id(admin.from("subjects").insert({ school_id: A.id, name: `${tag}-${name}-${fx.run}` }), name);
  const maths = await subject("Maths");
  const hist = await subject("HG");
  for (const y of [year, pastYear]) {
    must(await admin.from("grade_level_settings").insert({ school_id: A.id, academic_year_id: y, level_id: college, scale: 20, controls_count: 3, activities: true }), "rules");
  }
  const coef = (values) => admin.from("subject_coefficients").insert({ school_id: A.id, coefficient: 1, ...values });
  must(await coef({ academic_year_id: year, level_id: college, subject_id: maths, controls_count: 2, position: 1 }), "maths");
  must(await coef({ academic_year_id: year, level_id: college, subject_id: hist, position: 2 }), "hist");
  must(await coef({ academic_year_id: year, level_id: primaire, subject_id: maths }), "maths primaire");
  must(await coef({ academic_year_id: pastYear, level_id: college, subject_id: maths }), "maths past");
  const dirA = await signIn(fx.users.dirA);
  for (const t of [tch, tch2.id]) {
    must(await dirA.from("teacher_subjects").insert({ school_id: A.id, teacher_id: t, subject_id: maths }), "teaches");
  }
  const lesson = (y, s, c, t) =>
    id(admin.from("lessons").insert({ school_id: A.id, academic_year_id: y, time_slot_id: s, class_id: c, subject_id: maths, teacher_id: t }), "lesson");
  const lessons = [await lesson(year, slot, cA, tch), await lesson(year, slot, cB, tch2.id), await lesson(pastYear, pastSlot, cPast, tch)];

  const students = [];
  const kid = async (last, first, enrolments) => {
    const s = await id(admin.from("students").insert({ school_id: A.id, first_name: first, last_name: `${last}${tag}`, birth_date: "2012-01-01", gender: "female" }), last);
    students.push(s);
    for (const [y, c] of enrolments) must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: s, academic_year_id: y, class_id: c }), "enrol");
    return s;
  };
  const a1 = await kid("Alami", "Yasmine", [[year, cA], [pastYear, cPast]]);
  const a2 = await kid("Benali", "Omar", [[year, cA]]);
  const a3 = await kid("Chaoui", "Sara", [[year, cA]]);
  const b1 = await kid("Daoudi", "Imane", [[year, cB]]);
  const p1 = await kid("Elidrissi", "Adam", [[year, cP]]);
  const g = await id(admin.from("guardians").insert({ school_id: A.id, last_name: tag, first_name: "Parent", phone: randomMobile(), profile_id: parent.id }), "guardian");
  must(await admin.from("student_guardians").insert({ school_id: A.id, student_id: a1, guardian_id: g, relation: "mother" }), "link");
  done.push(async () => {
    await admin.from("student_guardians").delete().eq("guardian_id", g);
    await admin.from("guardians").delete().eq("id", g);
  });

  async function cleanup() {
    await admin.from("school_modules").update({ enabled: true }).eq("school_id", A.id).eq("module_key", "grades");
    for (const p of periods) await admin.from("grading_periods").update({ locked_at: p.locked_at }).eq("id", p.id);
    for (const step of done) await step();
    await admin.from("students").delete().in("id", students);
    await admin.from("lessons").delete().in("id", lessons);
    await admin.from("teacher_subjects").delete().eq("subject_id", maths);
    await admin.from("classes").delete().in("id", [cA, cB, cP, cPast]);
    await admin.from("time_slots").delete().in("id", [slot, pastSlot]);
    if (!monday) await admin.from("school_days").delete().eq("academic_year_id", year).eq("day_of_week", 1);
    await admin.from("subject_coefficients").delete().in("subject_id", [maths, hist]);
    await admin.from("grade_level_settings").delete().in("level_id", [college, primaire]);
    await admin.from("subjects").delete().in("id", [maths, hist]);
    await admin.from("levels").delete().in("id", [college, primaire]);
    await admin.from("academic_years").delete().eq("id", pastYear);
    if (before && before.id !== year) await admin.from("academic_years").update({ is_current: true }).eq("id", before.id);
    else if (!before) await admin.from("academic_years").update({ is_current: false }).eq("id", year);
    if (ownYear) await admin.from("academic_years").delete().eq("id", year);
    await admin.from("profiles").update({ must_change_password: tchState.must_change_password, deactivated_at: tchState.deactivated_at }).eq("id", tch);
  }

  return {
    A, tch, tch2, parent, year, pastYear, periods, pastPeriods, college, primaire,
    classes: { cA, cB, cP, cPast }, subjects: { maths, hist }, students: { a1, a2, a3, b1, p1 }, cleanup,
  };
}
