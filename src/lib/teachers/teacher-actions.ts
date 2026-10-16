"use server";

import { getSchoolActor } from "@/lib/auth/school-actor";
import { auditStructure } from "@/lib/structure/action-utils";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { createClient } from "@/lib/supabase/server";
import { teacherIdSchema, teacherSubjectsSchema } from "@/lib/validations/teachers";

// Which subjects a teacher teaches (teachers.manage), written through RLS with
// the caller's session. Error keys: `teachers.errors`.

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const CONSTRAINTS = {
  teacher_subjects_subject_fkey: "subjectNotFound",
  teacher_subjects_teacher_fkey: "notFound",
};

/**
 * Replaces the teacher's subjects with `subjectIds`: removes the ones no longer
 * chosen, adds the new ones. The database checks that the account is a teacher
 * of the caller's school and that every subject belongs to that school.
 */
export async function setTeacherSubjects(
  teacherId: unknown,
  subjectIds: unknown,
): Promise<Result<{ added: number; removed: number }>> {
  const actor = await getSchoolActor("teachers.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = teacherIdSchema.safeParse(teacherId);
  if (!id.success) return { ok: false, error: "notFound" };
  const wanted = teacherSubjectsSchema.safeParse(subjectIds);
  if (!wanted.success) {
    const key = wanted.error.issues[0]?.message;
    return { ok: false, error: key === "subjectNotFound" || key === "tooManySubjects" ? key : "generic" };
  }

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("teacher_subjects")
    .select("subject_id")
    .eq("school_id", actor.schoolId)
    .eq("teacher_id", id.data);
  if (readError) return { ok: false, error: dbErrorKey(readError) };

  const before = new Set(current.map((r) => r.subject_id));
  const after = new Set(wanted.data);
  const toRemove = [...before].filter((s) => !after.has(s));
  const toAdd = [...after].filter((s) => !before.has(s));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("teacher_subjects")
      .delete()
      .eq("school_id", actor.schoolId)
      .eq("teacher_id", id.data)
      .in("subject_id", toRemove);
    if (error) return { ok: false, error: dbErrorKey(error, CONSTRAINTS) };
  }
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("teacher_subjects")
      .insert(toAdd.map((subjectId) => ({ school_id: actor.schoolId, teacher_id: id.data, subject_id: subjectId })));
    if (error) {
      // The "is a teacher" trigger raises 23514; PostgREST does not pass its constraint name on.
      if (error.code === "23514") return { ok: false, error: "notTeacher" };
      const key = dbErrorKey(error, CONSTRAINTS);
      return { ok: false, error: key === "inUse" ? "notFound" : key };
    }
  }

  if (toAdd.length + toRemove.length > 0) {
    await auditStructure(actor, "teacher.subjects", "profile", id.data, {
      added: toAdd.length,
      removed: toRemove.length,
    });
  }
  return { ok: true, data: { added: toAdd.length, removed: toRemove.length } };
}
