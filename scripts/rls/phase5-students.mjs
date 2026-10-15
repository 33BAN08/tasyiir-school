// Phase 5 step 1: students + their class per academic year (database level).
// Reads: own school AND (students.view / students.manage, or linked to the
// student — nobody yet: guardians in step 3, teachers in Phase 6). The
// platform owner reads nothing. Writes: own school + students.manage.
import { allowed, check, denied, rows } from "./checks.mjs";

export async function phase5Students({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const C = fx.schools.c;
  const { anon, dirA, survA, tchA, mgrA, dirB, dirC, owner } = as;

  const one = async (query, what) => {
    const { data, error } = await query.select("id").single();
    if (error) throw new Error(`phase5Students setup: ${what} (${error.code})`);
    return data.id;
  };
  const refusedWith = async (label, query, code) => {
    const { error } = await query;
    check(`[P5] ${label}`, error?.code === code, error ? error.code : "ACCEPTED!");
  };

  // Structure: two far-future years in A (history), one in B; a level and a class in each.
  const year = (schoolId, start) => ({
    school_id: schoolId,
    label: `${start}-${start + 1}`,
    start_date: `${start}-09-01`,
    end_date: `${start + 1}-06-30`,
  });
  const yearA = await one(dirA.from("academic_years").insert(year(A.id, 2065)), "year A");
  const nextA = await one(dirA.from("academic_years").insert(year(A.id, 2066)), "next year A");
  const yearB = await one(dirB.from("academic_years").insert(year(B.id, 2065)), "year B");
  const levelA = await one(dirA.from("levels").insert({ school_id: A.id, name: "P5 level", cycle: "college" }), "level A");
  const levelB = await one(dirB.from("levels").insert({ school_id: B.id, name: "P5 level", cycle: "college" }), "level B");
  const klass = (client, schoolId, yearId, levelId, name) =>
    one(client.from("classes").insert({ school_id: schoolId, academic_year_id: yearId, level_id: levelId, name }), name);
  const classA = await klass(dirA, A.id, yearA, levelA, "P5-A");
  const classA2 = await klass(dirA, A.id, yearA, levelA, "P5-B");
  const nextClassA = await klass(dirA, A.id, nextA, levelA, "P5-A");
  const classB = await klass(dirB, B.id, yearB, levelB, "P5-A");

  // --- Students -------------------------------------------------------------------
  const student = (schoolId, extra = {}) => ({
    school_id: schoolId,
    first_name: "Amine",
    last_name: "BENALI",
    birth_date: "2014-03-02",
    gender: "male",
    ...extra,
  });
  const insert = (client, values) => client.from("students").insert(values).select("id");

  const amine = await one(
    dirA.from("students").insert(student(A.id, { first_name_ar: "أمين", last_name_ar: "بنعلي", code_massar: "J130012345" })),
    "student A",
  );
  await allowed("[P5] Arabic names are optional", insert(dirA, student(A.id, { first_name: "Sara", gender: "female" })));
  await refusedWith("only one Arabic name is refused (both or neither)",
    insert(dirA, student(A.id, { first_name_ar: "سارة" })), "23514");
  await refusedWith("a lowercase Massar code is refused", insert(dirA, student(A.id, { code_massar: "j130012346" })), "23514");
  await refusedWith("a Massar code with spaces is refused", insert(dirA, student(A.id, { code_massar: "J13 0012346" })), "23514");
  await refusedWith("an untrimmed name is refused", insert(dirA, student(A.id, { last_name: " BENALI" })), "23514");
  await refusedWith("an unknown gender is refused", insert(dirA, student(A.id, { gender: "x" })), "23514");
  await refusedWith("the same Massar code twice in a school is refused",
    insert(dirA, student(A.id, { code_massar: "J130012345" })), "23505");
  await allowed("[P5] another school may use the same Massar code",
    insert(dirB, student(B.id, { code_massar: "J130012345" })));
  await denied("[P5] director A cannot add a student in school B", insert(dirA, student(B.id)));
  await denied("[P5] surveillant cannot add a student", insert(survA, student(A.id)));
  await denied("[P5] teacher cannot add a student", insert(tchA, student(A.id)));
  await denied("[P5] suspended school's director cannot add a student", insert(dirC, student(C.id)));
  await denied("[P5] platform owner cannot add a student", insert(owner, student(A.id)));
  await denied("[P5] anonymous cannot add a student", insert(anon, student(A.id)));

  // --- Who reads ------------------------------------------------------------------
  const ofA = (client) => client.from("students").select("id").eq("school_id", A.id);
  await rows("[P5] director reads own school's students", ofA(dirA), 2);
  await rows("[P5] surveillant (students.view) reads them", ofA(survA), 2);
  await rows("[P5] teacher reads no student yet (Phase 6: own classes)", ofA(tchA), 0);
  await rows("[P5] staff without student permission reads none", ofA(mgrA), 0);
  await rows("[P5] director B reads no student of school A", ofA(dirB), 0);
  await rows("[P5] platform owner reads no student", ofA(owner), 0);
  const anonRead = await ofA(anon);
  check("[P5] anonymous reads no student (refused or empty)",
    Boolean(anonRead.error) || anonRead.data?.length === 0, anonRead.error?.code ?? `${anonRead.data?.length} row(s)`);

  // --- Writes on existing rows ----------------------------------------------------
  await allowed("[P5] director edits a student",
    dirA.from("students").update({ first_name: "Amin" }).eq("id", amine).select("id"));
  await denied("[P5] surveillant cannot edit a student",
    survA.from("students").update({ first_name: "X" }).eq("id", amine).select("id"));
  await denied("[P5] director B cannot edit school A's student",
    dirB.from("students").update({ first_name: "X" }).eq("id", amine).select("id"));
  await denied("[P5] director A cannot move a student to school B",
    dirA.from("students").update({ school_id: B.id }).eq("id", amine).select("id"));
  await denied("[P5] director B cannot delete school A's student",
    dirB.from("students").delete().eq("id", amine).select("id"));

  // --- Class per year -------------------------------------------------------------
  const enroll = (client, values) => client.from("student_enrollments").insert(values).select("student_id");
  const enrollment = (yearId, classId, schoolId = A.id) => ({
    school_id: schoolId,
    student_id: amine,
    academic_year_id: yearId,
    class_id: classId,
  });
  await allowed("[P5] director puts the student in a class", enroll(dirA, enrollment(yearA, classA)));
  await refusedWith("one class per student per year", enroll(dirA, enrollment(yearA, classA2)), "23505");
  await allowed("[P5] another year gets its own row (history kept)", enroll(dirA, enrollment(nextA, nextClassA)));
  await refusedWith("a class of another year is refused",
    dirA.from("student_enrollments").update({ class_id: nextClassA }).eq("student_id", amine).eq("academic_year_id", yearA).select("student_id"),
    "23503");
  await refusedWith("a class of another school is refused",
    dirA.from("student_enrollments").update({ class_id: classB }).eq("student_id", amine).eq("academic_year_id", yearA).select("student_id"),
    "23503");
  await denied("[P5] surveillant cannot change a class",
    survA.from("student_enrollments").update({ class_id: classA2 }).eq("student_id", amine).eq("academic_year_id", yearA).select("student_id"));
  await allowed("[P5] director changes this year's class",
    dirA.from("student_enrollments").update({ class_id: classA2 }).eq("student_id", amine).eq("academic_year_id", yearA).select("student_id"));
  await rows("[P5] …the other year's class is untouched",
    dirA.from("student_enrollments").select("class_id").eq("student_id", amine).eq("class_id", nextClassA), 1);

  const enrollmentsOfA = (client) => client.from("student_enrollments").select("student_id").eq("school_id", A.id);
  await rows("[P5] surveillant reads classes of students", enrollmentsOfA(survA), 2);
  await rows("[P5] teacher reads no class of students yet", enrollmentsOfA(tchA), 0);
  await rows("[P5] director B reads none of school A", enrollmentsOfA(dirB), 0);
  await rows("[P5] platform owner reads none", enrollmentsOfA(owner), 0);

  await refusedWith("a class that has students cannot be deleted",
    dirA.from("classes").delete().eq("id", classA2), "23503");

  // --- Delete -----------------------------------------------------------------------
  await denied("[P5] surveillant cannot delete a student", survA.from("students").delete().eq("id", amine).select("id"));
  await allowed("[P5] director deletes a student", dirA.from("students").delete().eq("id", amine).select("id"));
  await rows("[P5] …with their classes of every year",
    dirA.from("student_enrollments").select("student_id").eq("student_id", amine), 0);

  // Leave nothing for the next suites.
  await dirA.from("students").delete().eq("school_id", A.id);
  await dirB.from("students").delete().eq("school_id", B.id);
  await dirA.from("classes").delete().in("id", [classA, classA2, nextClassA]);
  await dirB.from("classes").delete().eq("id", classB);
  await dirA.from("levels").delete().eq("id", levelA);
  await dirB.from("levels").delete().eq("id", levelB);
  await dirA.from("academic_years").delete().in("id", [yearA, nextA]);
  await dirB.from("academic_years").delete().eq("id", yearB);
}
