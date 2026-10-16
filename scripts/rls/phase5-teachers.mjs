// Phase 5 step 4: teachers and the subjects they teach (database level).
// Writes through RLS with the user's session: own school + teachers.manage.
import { allowed, check, denied, rows } from "./checks.mjs";
import { admin } from "./fixtures.mjs";

export async function phase5Teachers({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const { anon, dirA, survA, tchA, audA, dirB, dirC, owner } = as;
  const tch = fx.users.tchA.id;

  const refusedWith = async (label, query, code) => {
    const { error } = await query;
    check(`[P5 teachers] ${label}`, error?.code === code, error ? error.code : "ACCEPTED!");
  };
  const subject = async (school, name) =>
    (await admin.from("subjects").insert({ school_id: school.id, name }).select("id").single()).data.id;
  const mathA = await subject(A, "T-Maths");
  const frA = await subject(A, "T-Français");
  const mathB = await subject(B, "T-Maths");
  const link = (schoolId, teacherId, subjectId) => ({ school_id: schoolId, teacher_id: teacherId, subject_id: subjectId });
  const insert = (client, values) => client.from("teacher_subjects").insert(values).select("subject_id");

  // --- Writes ---------------------------------------------------------------------
  await allowed("[P5 teachers] director gives a subject to a teacher", insert(dirA, link(A.id, tch, mathA)));
  await allowed("[P5 teachers] …and a second one", insert(dirA, link(A.id, tch, frA)));
  await refusedWith("the same subject twice is refused", insert(dirA, link(A.id, tch, mathA)), "23505");
  await refusedWith("a non-teacher account (surveillant) cannot get subjects",
    insert(dirA, link(A.id, fx.users.survA.id, mathA)), "23514");
  await refusedWith("another school's subject is refused", insert(dirA, link(A.id, tch, mathB)), "23503");
  await denied("[P5 teachers] director B cannot give school A's teacher a subject", insert(dirB, link(A.id, tch, mathA)));
  await denied("[P5 teachers] director B cannot use school A's teacher in school B", insert(dirB, link(B.id, tch, mathB)));
  await denied("[P5 teachers] surveillant cannot give subjects", insert(survA, link(A.id, tch, mathA)));
  await denied("[P5 teachers] a teacher cannot give themself subjects", insert(tchA, link(A.id, tch, mathA)));
  await denied("[P5 teachers] suspended school's director cannot give subjects",
    insert(dirC, link(fx.schools.c.id, tch, mathA)));
  await denied("[P5 teachers] platform owner cannot give subjects", insert(owner, link(A.id, tch, mathA)));
  await denied("[P5 teachers] anonymous cannot give subjects", insert(anon, link(A.id, tch, mathA)));
  await denied("[P5 teachers] no UPDATE (a change is delete + insert)",
    dirA.from("teacher_subjects").update({ subject_id: frA }).eq("teacher_id", tch).select("subject_id"));

  // --- Reads ----------------------------------------------------------------------
  const ofTeacher = (client) => client.from("teacher_subjects").select("subject_id").eq("teacher_id", tch);
  await rows("[P5 teachers] director reads the teacher's subjects", ofTeacher(dirA), 2);
  await rows("[P5 teachers] the teacher reads their own subjects", ofTeacher(tchA), 2);
  // Phase 6: timetable.manage (surveillant) reads them to offer the right teachers.
  await rows("[P5 teachers] surveillant (timetable.manage) reads them", ofTeacher(survA), 2);
  await rows("[P5 teachers] staff without users.view / teachers.manage / timetable.manage reads none", ofTeacher(audA), 0);
  await rows("[P5 teachers] director B reads none", ofTeacher(dirB), 0);
  await rows("[P5 teachers] platform owner reads none", ofTeacher(owner), 0);
  await denied("[P5 teachers] anonymous cannot read (no grant)", ofTeacher(anon));

  // teachers.manage alone: may read the TEACHER accounts of the school, no other profile.
  const auditorRole = A.roles.auditor;
  await admin.from("role_permissions").insert({ role_id: auditorRole, permission_key: "teachers.manage" });
  await rows("[P5 teachers] teachers.manage alone reads the teacher account",
    audA.from("profiles").select("id").eq("id", tch), 1);
  await rows("[P5 teachers] …but not other staff accounts",
    audA.from("profiles").select("id").in("id", [fx.users.survA.id, fx.users.dirA.id]), 0);
  await rows("[P5 teachers] …and reads the teacher's subjects", ofTeacher(audA), 2);
  await admin.from("role_permissions").delete().eq("role_id", auditorRole).eq("permission_key", "teachers.manage");

  // --- Deletes and cascades -------------------------------------------------------
  await denied("[P5 teachers] director B cannot remove school A's subject links",
    dirB.from("teacher_subjects").delete().eq("teacher_id", tch).select("subject_id"));
  await denied("[P5 teachers] the teacher cannot remove their subjects",
    tchA.from("teacher_subjects").delete().eq("teacher_id", tch).select("subject_id"));
  await allowed("[P5 teachers] director removes a subject from the teacher",
    dirA.from("teacher_subjects").delete().eq("teacher_id", tch).eq("subject_id", frA).select("subject_id"));
  await admin.from("subjects").delete().eq("id", mathA);
  await rows("[P5 teachers] deleting a subject removes it from teachers", ofTeacher(dirA), 0);

  // Role change: an account that stops being a teacher loses its subjects.
  await admin.from("teacher_subjects").insert(link(A.id, tch, frA));
  await admin.from("profiles").update({ role_id: A.roles.surveillant }).eq("id", tch);
  const { count } = await admin.from("teacher_subjects").select("subject_id", { count: "exact", head: true }).eq("teacher_id", tch);
  check("[P5 teachers] a teacher moved to another role loses their subjects", count === 0, `${count} left`);
  await admin.from("profiles").update({ role_id: A.roles.teacher }).eq("id", tch);

  await admin.from("subjects").delete().in("id", [frA, mathB]);
}
