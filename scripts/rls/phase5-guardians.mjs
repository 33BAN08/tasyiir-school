// Phase 5 step 3: guardians, their links to students, and what a PARENT
// account can read. Staff: students.view / parents.manage read the school's
// guardians; parents.manage writes. A parent reads only their own guardian
// row, their own links, their own children (and their classes and photos) —
// and only with an ACTIVE parent account (not deactivated, own password set)
// in an ACTIVE school.
import { randomBytes, randomUUID } from "node:crypto";

import { allowed, check, denied, rows } from "./checks.mjs";
import { admin, anon, signIn } from "./fixtures.mjs";

const BUCKET = "student-photos";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
/** A random mobile, so parallel / old runs never collide on the global sign-in. */
export const randomMobile = () => `+2126${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

export async function phase5Guardians({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const C = fx.schools.c;
  const { dirA, survA, tchA, mgrA, dirB, owner } = as;

  const must = (r, what) => {
    if (r.error) throw new Error(`phase5Guardians setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const refusedWith = async (label, query, code) => {
    const { error } = await query;
    check(`[P5 parent] ${label}`, error?.code === code, error ? error.code : "ACCEPTED!");
  };

  // --- Students (admin, so suspended school C gets one too) -------------------------
  const kid = async (school, lastName) =>
    must(
      await admin
        .from("students")
        .insert({ school_id: school.id, first_name: "Kid", last_name: lastName, birth_date: "2014-01-01", gender: "male" })
        .select("id")
        .single(),
      `student ${lastName}`,
    ).id;
  const kidA1 = await kid(A, "FAMA1");
  const kidA2 = await kid(A, "FAMA2");
  const kidA3 = await kid(A, "OTHERFAM");
  const kidB = await kid(B, "FAMB");
  const kidC = await kid(C, "FAMC");

  // --- Parent accounts (admin, like the app's secret-key step) -----------------------
  const parent = async (school, name, { mustChange = false, deactivated = false } = {}) => {
    const phone = randomMobile();
    const email = `${phone.slice(1)}@phone.tasyiir.invalid`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), `user ${name}`).user;
    fx.createdUserIds.push(user.id);
    must(
      await admin.from("profiles").insert({
        id: user.id,
        school_id: school.id,
        role_id: school.roles.parent,
        full_name: `RLS ${name}`,
        must_change_password: mustChange,
        deactivated_at: deactivated ? new Date().toISOString() : null,
      }),
      `profile ${name}`,
    );
    return { id: user.id, phone, email, password, client: await signIn({ email, password }) };
  };
  const parA = await parent(A, "parA");
  const parA2 = await parent(A, "parA2");
  const parPending = await parent(A, "parPending", { mustChange: true });
  const parDeact = await parent(A, "parDeact", { deactivated: true });
  const parB = await parent(B, "parB");
  const parC = await parent(C, "parC");

  // --- Guardians (staff, through RLS) -------------------------------------------------
  const guardian = (schoolId, phone, extra = {}) => ({ school_id: schoolId, last_name: "PARENT", first_name: "Test", phone, ...extra });
  const insertGuardian = (client, values) => client.from("guardians").insert(values).select("id");
  const one = async (query, what) => must(await query.select("id").single(), what).id;

  const gA = await one(dirA.from("guardians").insert(guardian(A.id, parA.phone, { profile_id: parA.id })), "guardian A");
  const gMotherA1 = await one(dirA.from("guardians").insert(guardian(A.id, randomMobile(), { first_name: "Mother" })), "mother A1");
  const gA2 = await one(dirA.from("guardians").insert(guardian(A.id, parA2.phone, { profile_id: parA2.id })), "guardian A2");
  const gPending = await one(dirA.from("guardians").insert(guardian(A.id, parPending.phone, { profile_id: parPending.id })), "g pending");
  const gDeact = await one(dirA.from("guardians").insert(guardian(A.id, parDeact.phone, { profile_id: parDeact.id })), "g deact");
  const gTeacher = await one(dirA.from("guardians").insert(guardian(A.id, randomMobile(), { profile_id: fx.users.tchA.id })), "g teacher");
  const gB = await one(dirB.from("guardians").insert(guardian(B.id, parB.phone, { profile_id: parB.id })), "guardian B");
  const gC = must(await admin.from("guardians").insert(guardian(C.id, parC.phone, { profile_id: parC.id })).select("id").single(), "g C").id;

  await refusedWith("a landline / badly formatted phone is refused", insertGuardian(dirA, guardian(A.id, "0522123456")), "23514");
  await refusedWith("the same phone twice in a school is refused", insertGuardian(dirA, guardian(A.id, parA.phone)), "23505");
  await allowed("[P5 parent] another school may record the same phone", insertGuardian(dirB, guardian(B.id, parA.phone)));
  await refusedWith("an account of another school cannot be linked",
    insertGuardian(dirA, guardian(A.id, randomMobile(), { profile_id: fx.users.dirB.id })), "23503");
  await denied("[P5 parent] surveillant (view only) cannot add a guardian", insertGuardian(survA, guardian(A.id, randomMobile())));
  await denied("[P5 parent] director A cannot add a guardian in school B", insertGuardian(dirA, guardian(B.id, randomMobile())));
  await denied("[P5 parent] a parent cannot add a guardian", insertGuardian(parA.client, guardian(A.id, randomMobile())));

  // --- Links ----------------------------------------------------------------------------
  const link = (client, schoolId, studentId, guardianId, relation) =>
    client.from("student_guardians").insert({ school_id: schoolId, student_id: studentId, guardian_id: guardianId, relation }).select("student_id");
  for (const [s, g, r] of [
    [kidA1, gA, "father"], [kidA2, gA, "father"], [kidA1, gMotherA1, "mother"], [kidA3, gA2, "tutor"],
    [kidA1, gPending, "tutor"], [kidA1, gDeact, "tutor"], [kidA3, gTeacher, "tutor"],
  ]) {
    must(await link(dirA, A.id, s, g, r), "link");
  }
  must(await link(dirB, B.id, kidB, gB, "mother"), "link B");
  must(await admin.from("student_guardians").insert({ school_id: C.id, student_id: kidC, guardian_id: gC, relation: "father" }), "link C");

  await refusedWith("a second father for a student is refused", link(dirA, A.id, kidA1, gA2, "father"), "23505");
  await allowed("[P5 parent] several tuteurs are fine", link(dirA, A.id, kidA2, gA2, "tutor"));
  await refusedWith("a guardian cannot be linked to another school's student", link(dirA, A.id, kidB, gA2, "tutor"), "23503");
  await denied("[P5 parent] director B cannot link in school A", link(dirB, A.id, kidA3, gA, "tutor"));
  await denied("[P5 parent] surveillant cannot link", link(survA, A.id, kidA3, gA, "tutor"));
  await denied("[P5 parent] a parent cannot link themselves to another child", link(parA.client, A.id, kidA3, gA, "tutor"));

  // --- Staff reads ---------------------------------------------------------------------
  const guardiansOfA = (client) => client.from("guardians").select("id").eq("school_id", A.id);
  await rows("[P5 parent] surveillant (students.view) reads the school's guardians", guardiansOfA(survA), (r) => r.length >= 6);
  // Only the row pointing at the teacher's own account (the trap above), never another family's.
  await rows("[P5 parent] teacher reads no other guardian", guardiansOfA(tchA), (r) => r.length === 1 && r[0].id === gTeacher);
  await rows("[P5 parent] staff without student/parent permission reads none", guardiansOfA(mgrA), 0);
  await rows("[P5 parent] director B reads no guardian of A", guardiansOfA(dirB), 0);
  await rows("[P5 parent] platform owner reads no guardian", guardiansOfA(owner), 0);
  const anonRead = await guardiansOfA(anon());
  check("[P5 parent] anonymous reads no guardian", Boolean(anonRead.error) || anonRead.data?.length === 0, "");

  // --- What a parent reads ---------------------------------------------------------------
  const studentIds = async (client) => ((await client.from("students").select("id")).data ?? []).map((s) => s.id).sort();
  check("[P5 parent] parent A reads exactly their two children",
    JSON.stringify(await studentIds(parA.client)) === JSON.stringify([kidA1, kidA2].sort()), "");
  check("[P5 parent] the other family's parent reads only their own children",
    JSON.stringify(await studentIds(parA2.client)) === JSON.stringify([kidA2, kidA3].sort()), "");
  await rows("[P5 parent] parent A reads only their OWN guardian row (not the mother's phone)",
    parA.client.from("guardians").select("id, phone"), (r) => r.length === 1 && r[0].id === gA);
  await rows("[P5 parent] parent A reads only their own links", parA.client.from("student_guardians").select("guardian_id"),
    (r) => r.length === 2 && r.every((l) => l.guardian_id === gA));
  await rows("[P5 parent] parent waiting for their own password reads no child", parPending.client.from("students").select("id"), 0);
  await rows("[P5 parent] deactivated parent reads no child", parDeact.client.from("students").select("id"), 0);
  await rows("[P5 parent] parent of a suspended school reads no child", parC.client.from("students").select("id"), 0);
  await rows("[P5 parent] parent B reads no child of school A",
    parB.client.from("students").select("id").eq("school_id", A.id), 0);
  await rows("[P5 parent] a teacher linked as 'guardian' still reads no child (parent role only)",
    tchA.from("students").select("id"), 0);
  await denied("[P5 parent] a parent cannot edit their child",
    parA.client.from("students").update({ first_name: "X" }).eq("id", kidA1).select("id"));
  await denied("[P5 parent] a parent cannot edit their own guardian row",
    parA.client.from("guardians").update({ phone: randomMobile() }).eq("id", gA).select("id"));

  // Classes of their children only.
  const year = must(
    await admin
      .from("academic_years")
      .insert({ school_id: A.id, label: "2069-2070", start_date: "2069-09-01", end_date: "2070-06-30" })
      .select("id")
      .single(),
    "year",
  ).id;
  const level = must(await admin.from("levels").insert({ school_id: A.id, name: "P5G level", cycle: "college" }).select("id").single(), "level").id;
  const klass = must(
    await admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: "P5G-A" }).select("id").single(),
    "class",
  ).id;
  must(
    await admin.from("student_enrollments").insert(
      [kidA1, kidA3].map((s) => ({ school_id: A.id, student_id: s, academic_year_id: year, class_id: klass })),
    ),
    "enrollments",
  );
  await rows("[P5 parent] parent A reads the class of their child only",
    parA.client.from("student_enrollments").select("student_id"), (r) => r.length === 1 && r[0].student_id === kidA1);

  // Photos: their child's, not another family's.
  const photo = async (studentId) => {
    const p = `${A.id}/${studentId}/${randomUUID()}.png`;
    must(await admin.storage.from(BUCKET).upload(p, PNG, { contentType: "image/png" }), "photo upload");
    must(await admin.from("students").update({ photo_path: p }).eq("id", studentId), "photo path");
    return p;
  };
  const photoA1 = await photo(kidA1);
  const photoA3 = await photo(kidA3);
  const sign = (client, p) => client.storage.from(BUCKET).createSignedUrl(p, 60);
  const own = await sign(parA.client, photoA1);
  check("[P5 parent] parent A gets a signed URL for their child's photo", !own.error, own.error?.message ?? "ok");
  const other = await sign(parA.client, photoA3);
  check("[P5 parent] parent A gets none for another family's child", Boolean(other.error), other.error ? "refused" : "ACCEPTED!");
  const pending = await sign(parPending.client, photoA1);
  check("[P5 parent] a parent still on a temporary password gets none", Boolean(pending.error), pending.error ? "refused" : "ACCEPTED!");

  // Leave nothing for the next suites (accounts go with the fixture schools).
  await admin.storage.from(BUCKET).remove([photoA1, photoA3]);
  await admin.from("students").delete().in("id", [kidA1, kidA2, kidA3, kidB, kidC]);
  await admin.from("guardians").delete().in("school_id", [A.id, B.id, C.id]);
  await admin.from("classes").delete().eq("id", klass);
  await admin.from("levels").delete().eq("id", level);
  await admin.from("academic_years").delete().eq("id", year);
}
