"use server";

import { logAudit } from "@/lib/audit";
import { areaFor } from "@/lib/auth/roles";
import { blockedPath, getCurrentUser } from "@/lib/auth/session";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { createClient } from "@/lib/supabase/server";
import { gradeCellsSchema, gradeIdSchema } from "@/lib/validations/grades";

import { getGradeAccess } from "./access";

// One grade sheet (class + subject + semester) saved in ONE call to
// public.save_grades (one transaction, all or nothing). RLS and the grades
// trigger decide: a teacher only their own pairs of the current year,
// grades.manage any; locked semester, scale, contrôle count refused.
// Error keys: `grades.errors`.

type Result = { ok: true; data: { saved: number } } | { ok: false; error: string };

const GRADE_ERRORS = {
  grades_forbidden: "forbidden",
  grades_period_not_found: "notFound",
  grades_too_many: "tooMany",
  grading_period_locked: "periodLocked",
  grade_score_above_scale: "aboveScale",
  grade_number_too_high: "numberTooHigh",
  grade_no_activities: "noActivities",
  grade_subject_not_graded: "subjectNotGraded",
  grade_student_not_enrolled: "notEnrolled",
  grades_score_check: "invalidMark",
};

export async function saveGrades(classId: unknown, subjectId: unknown, periodId: unknown, cells: unknown): Promise<Result> {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword || blockedPath(user) || !user.schoolId || areaFor(user) !== "school") {
    return { ok: false, error: "forbidden" };
  }
  const access = await getGradeAccess(user);
  if (access !== "manage" && access !== "teacher") return { ok: false, error: "forbidden" };

  const klass = gradeIdSchema.safeParse(classId);
  const subject = gradeIdSchema.safeParse(subjectId);
  const period = gradeIdSchema.safeParse(periodId);
  if (!klass.success || !subject.success || !period.success) return { ok: false, error: "notFound" };
  const parsed = gradeCellsSchema.safeParse(cells);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "generic" };
  if (parsed.data.length === 0) return { ok: true, data: { saved: 0 } };

  const { data, error } = await (await createClient()).rpc("save_grades", {
    p_period: period.data,
    p_subject: subject.data,
    p_cells: parsed.data.map((c) => ({
      student_id: c.studentId,
      kind: c.kind,
      number: c.number,
      score: c.score,
      absent: c.absent,
      clear: c.clear,
    })),
  });
  if (error) return { ok: false, error: dbErrorKey(error, GRADE_ERRORS) };

  await logAudit({
    actorId: user.id,
    schoolId: user.schoolId,
    action: "grades.save",
    entity: "grading_period",
    entityId: period.data,
    data: { class: klass.data, subject: subject.data, cells: parsed.data.length, rows: data },
  });
  return { ok: true, data: { saved: data } };
}
