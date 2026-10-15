"use server";

import { logAudit } from "@/lib/audit";
import { getSchoolActor, type SchoolActor } from "@/lib/auth/school-actor";
import { parseInput } from "@/lib/structure/action-utils";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { createClient } from "@/lib/supabase/server";
import { studentIdSchema, studentSchema, type StudentFormValues, type StudentInput } from "@/lib/validations/students";

// Students (students.manage), written through RLS with the caller's session.
// The class is the one of the CURRENT academic year: one enrollment row per
// student and year, so other years' classes are never touched.
// Error keys: `students.errors`.

type StudentField = keyof StudentFormValues;
type Result<T> = { ok: true; data: T } | { ok: false; error: string; field?: StudentField };

const STUDENT_CONSTRAINTS = {
  students_code_massar_key: "massarTaken",
  students_code_massar_check: "invalidMassar",
  students_names_ar_check: "arabicNamesBoth",
  students_birth_date_check: "birthDateRange",
  student_enrollments_class_fkey: "invalidClass",
};
const FIELD_OF: Record<string, StudentField> = {
  massarTaken: "codeMassar",
  invalidMassar: "codeMassar",
  arabicNamesBoth: "lastNameAr",
  birthDateRange: "birthDate",
  invalidClass: "classId",
  noCurrentYear: "classId",
};

function failure(key: string): { ok: false; error: string; field?: StudentField } {
  return { ok: false, error: key, field: FIELD_OF[key] };
}

function columns(v: StudentInput) {
  return {
    last_name: v.lastName,
    first_name: v.firstName,
    last_name_ar: v.lastNameAr || null,
    first_name_ar: v.firstNameAr || null,
    birth_date: v.birthDate,
    gender: v.gender,
    code_massar: v.codeMassar || null,
  };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function currentYearId(supabase: Supabase, schoolId: string): Promise<string | null> {
  const { data } = await supabase
    .from("academic_years")
    .select("id")
    .eq("school_id", schoolId)
    .eq("is_current", true)
    .maybeSingle();
  return data?.id ?? null;
}

function audit(actor: SchoolActor, action: string, studentId: string, data: Record<string, string | null>) {
  return logAudit({ actorId: actor.id, schoolId: actor.schoolId, action, entity: "student", entityId: studentId, data });
}

export async function createStudent(input: unknown): Promise<Result<{ id: string }>> {
  const actor = await getSchoolActor("students.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const v = parseInput<typeof studentSchema, StudentField>(studentSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const supabase = await createClient();
  const yearId = v.values.classId ? await currentYearId(supabase, actor.schoolId) : null;
  if (v.values.classId && !yearId) return failure("noCurrentYear");

  const { data, error } = await supabase
    .from("students")
    .insert({ school_id: actor.schoolId, ...columns(v.values) })
    .select("id")
    .single();
  if (error) return failure(dbErrorKey(error, STUDENT_CONSTRAINTS));

  if (yearId) {
    const { error: classError } = await supabase.from("student_enrollments").insert({
      school_id: actor.schoolId,
      student_id: data.id,
      academic_year_id: yearId,
      class_id: v.values.classId,
    });
    if (classError) {
      // All or nothing: no student left without the class that was asked for.
      await supabase.from("students").delete().eq("id", data.id).eq("school_id", actor.schoolId);
      return failure(dbErrorKey(classError, STUDENT_CONSTRAINTS));
    }
  }

  await audit(actor, "student.create", data.id, {
    name: `${v.values.lastName} ${v.values.firstName}`,
    classId: v.values.classId || null,
  });
  return { ok: true, data: { id: data.id } };
}

export async function updateStudent(studentId: unknown, input: unknown): Promise<Result<null>> {
  const actor = await getSchoolActor("students.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = studentIdSchema.safeParse(studentId);
  if (!id.success) return { ok: false, error: "notFound" };
  const v = parseInput<typeof studentSchema, StudentField>(studentSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const supabase = await createClient();
  const yearId = await currentYearId(supabase, actor.schoolId);
  if (v.values.classId && !yearId) return failure("noCurrentYear");

  const { data, error } = await supabase
    .from("students")
    .update(columns(v.values))
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("id");
  if (error) return failure(dbErrorKey(error, STUDENT_CONSTRAINTS));
  if (data.length === 0) return { ok: false, error: "notFound" };

  // This year's class only; past years keep theirs.
  let previousClassId: string | null = null;
  if (yearId) {
    const { data: before } = await supabase
      .from("student_enrollments")
      .select("class_id")
      .eq("student_id", id.data)
      .eq("academic_year_id", yearId)
      .maybeSingle();
    previousClassId = before?.class_id ?? null;

    if (previousClassId !== (v.values.classId || null)) {
      const { error: classError } = v.values.classId
        ? await supabase.from("student_enrollments").upsert(
            {
              school_id: actor.schoolId,
              student_id: id.data,
              academic_year_id: yearId,
              class_id: v.values.classId,
            },
            { onConflict: "student_id,academic_year_id" },
          )
        : await supabase
            .from("student_enrollments")
            .delete()
            .eq("student_id", id.data)
            .eq("academic_year_id", yearId)
            .eq("school_id", actor.schoolId);
      if (classError) return failure(dbErrorKey(classError, STUDENT_CONSTRAINTS));
    }
  }

  await audit(actor, "student.update", id.data, {
    name: `${v.values.lastName} ${v.values.firstName}`,
    classId: v.values.classId || null,
    previousClassId,
  });
  return { ok: true, data: null };
}

export async function deleteStudent(studentId: unknown): Promise<Result<null>> {
  const actor = await getSchoolActor("students.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = studentIdSchema.safeParse(studentId);
  if (!id.success) return { ok: false, error: "notFound" };

  const { data, error } = await (await createClient())
    .from("students")
    .delete()
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("last_name, first_name");
  if (error) return { ok: false, error: dbErrorKey(error) };
  if (data.length === 0) return { ok: false, error: "notFound" };

  await audit(actor, "student.delete", id.data, { name: `${data[0].last_name} ${data[0].first_name}` });
  return { ok: true, data: null };
}
