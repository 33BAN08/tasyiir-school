"use server";

import type { GapStudent } from "@/components/features/grades/gaps-list";
import { routing } from "@/i18n/routing";
import { getSchoolActor } from "@/lib/auth/school-actor";
import { listClasses } from "@/lib/structure/classes";
import { studentName } from "@/lib/students/names";
import { createClient } from "@/lib/supabase/server";
import { gradeIdSchema } from "@/lib/validations/grades";

import { getClassGaps } from "./completeness";
import { listClassStudents } from "./council";

// Before locking a semester (grades.manage): every class's students with empty
// cells, so the director decides knowingly. Read-only; locking itself is
// unchanged (setPeriodLocked). At most MAX students are listed, the rest counted.

const MAX = 60;

type Result = { ok: true; data: { gaps: GapStudent[]; more: number } } | { ok: false; error: string };

export async function previewLockGaps(periodId: unknown, locale: unknown): Promise<Result> {
  const actor = await getSchoolActor("grades.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = gradeIdSchema.safeParse(periodId);
  if (!id.success) return { ok: false, error: "notFound" };
  const lang = routing.locales.find((l) => l === locale) ?? routing.defaultLocale;

  const supabase = await createClient();
  const { data: period } = await supabase
    .from("grading_periods")
    .select("id, academic_year_id")
    .eq("school_id", actor.schoolId)
    .eq("id", id.data)
    .maybeSingle();
  if (!period) return { ok: false, error: "notFound" };
  const yearId = period.academic_year_id;

  const [classes, subjects] = await Promise.all([
    listClasses(actor.schoolId, yearId),
    supabase.from("subjects").select("id, name").eq("school_id", actor.schoolId),
  ]);
  const subjectNames = new Map((subjects.data ?? []).map((s) => [s.id, s.name]));
  const perClass = await Promise.all(
    classes.map(async (c) => {
      const klass = { id: c.id, yearId, levelId: c.levelId, trackId: c.trackId };
      const [gaps, students] = await Promise.all([getClassGaps(klass, period.id), listClassStudents(actor.schoolId, c.id, yearId)]);
      return students
        .filter((s) => gaps.some((g) => g.studentId === s.id))
        .map((s): GapStudent => ({
          student: studentName(s, lang),
          group: c.name,
          items: gaps.filter((g) => g.studentId === s.id).map((g) => ({
            subject: subjectNames.get(g.subjectId) ?? "",
            period: null,
            entered: g.entered,
            expected: g.expected,
          })),
        }));
    }),
  );
  const all = perClass.flat();
  return { ok: true, data: { gaps: all.slice(0, MAX), more: Math.max(0, all.length - MAX) } };
}
