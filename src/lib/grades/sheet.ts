import "server-only";

import { getCurrentYear } from "@/lib/students/students";
import { compareClassNames } from "@/lib/structure/class-names";
import type { SubjectColor } from "@/lib/structure/subject-template";
import { createClient } from "@/lib/supabase/server";

import { gradeText, markKey, type GradeKind, type SheetColumn } from "./marks";

// Reads for the grade sheets (/grades), with the caller's session: RLS returns
// a teacher's own lessons and students, and only the grades they may read.
// The explicit school filters are a second fence.

export type SheetPair = { classId: string; className: string; subjectId: string; subjectName: string; subjectColor: SubjectColor };

/** A teacher's class + subject pairs of the current year (from their lessons). */
export async function listTeacherPairs(schoolId: string, teacherId: string): Promise<SheetPair[]> {
  const year = await getCurrentYear(schoolId);
  if (!year) return [];
  const { data, error } = await (await createClient())
    .from("lessons")
    .select("class_id, subject_id, class:classes(name), subject:subjects(name, color)")
    .eq("school_id", schoolId)
    .eq("academic_year_id", year.id)
    .eq("teacher_id", teacherId);
  if (error) throw new Error("listTeacherPairs failed");
  const pairs = new Map<string, SheetPair>();
  for (const l of data) {
    pairs.set(`${l.class_id}:${l.subject_id}`, {
      classId: l.class_id,
      className: l.class?.name ?? "",
      subjectId: l.subject_id,
      subjectName: l.subject?.name ?? "",
      subjectColor: (l.subject?.color ?? "slate") as SubjectColor,
    });
  }
  return [...pairs.values()].sort(
    (a, b) => compareClassNames(a.className, b.className) || a.subjectName.localeCompare(b.subjectName),
  );
}

/** The subjects graded in a class (its level's common rows + its filière's), report card order. */
export async function listClassSubjects(
  schoolId: string,
  klass: { yearId: string; levelId: string; trackId: string | null },
): Promise<{ id: string; name: string; color: SubjectColor }[]> {
  const { data, error } = await (await createClient())
    .from("subject_coefficients")
    .select("subject_id, track_id, position, subject:subjects(name, color)")
    .eq("school_id", schoolId)
    .eq("academic_year_id", klass.yearId)
    .eq("level_id", klass.levelId);
  if (error) throw new Error("listClassSubjects failed");
  const rows = data.filter((r) => r.track_id === null || r.track_id === klass.trackId);
  const best = new Map<string, { id: string; name: string; color: SubjectColor; position: number }>();
  for (const r of rows) {
    const prev = best.get(r.subject_id);
    if (!prev || r.position < prev.position) {
      best.set(r.subject_id, {
        id: r.subject_id,
        name: r.subject?.name ?? "",
        color: (r.subject?.color ?? "slate") as SubjectColor,
        position: r.position,
      });
    }
  }
  return [...best.values()].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)).map((s) => ({ id: s.id, name: s.name, color: s.color }));
}

export type SheetClass = { id: string; name: string; yearId: string; levelId: string; trackId: string | null };

export async function getSheetClass(schoolId: string, classId: string): Promise<SheetClass | null> {
  const { data } = await (await createClient())
    .from("classes")
    .select("id, name, academic_year_id, level_id, track_id")
    .eq("school_id", schoolId)
    .eq("id", classId)
    .maybeSingle();
  return data ? { id: data.id, name: data.name, yearId: data.academic_year_id, levelId: data.level_id, trackId: data.track_id } : null;
}

export type SheetPeriod = { id: string; number: number; startDate: string; endDate: string; locked: boolean };

export async function listYearPeriods(schoolId: string, yearId: string): Promise<SheetPeriod[]> {
  const { data, error } = await (await createClient())
    .from("grading_periods")
    .select("id, number, start_date, end_date, locked_at")
    .eq("school_id", schoolId)
    .eq("academic_year_id", yearId)
    .order("number");
  if (error) throw new Error("listYearPeriods failed");
  return data.map((p) => ({ id: p.id, number: p.number, startDate: p.start_date, endDate: p.end_date, locked: p.locked_at !== null }));
}

export type SheetStudent = { id: string; firstName: string; lastName: string; firstNameAr: string | null; lastNameAr: string | null };

export type GradeSheet = {
  scale: number;
  /** Editable columns (contrôles 1..N, then activités when the level has them), then read-only extra ones. */
  columns: SheetColumn[];
  students: SheetStudent[];
  /** Saved grades: cell key → text ("14,5", "abs"). */
  marks: Record<string, string>;
  /** The subject is graded at this class's level / filière (else nothing can be entered). */
  graded: boolean;
  /** The level counts an absent contrôle as 0 (else it is left out). */
  absentAsZero: boolean;
};

/** One sheet: the class's students, the level's rules for the subject, the saved grades of the semester. */
export async function getGradeSheet(schoolId: string, klass: SheetClass, subjectId: string, periodId: string): Promise<GradeSheet> {
  const supabase = await createClient();
  const [rules, coefs, cycle, enrolments, grades] = await Promise.all([
    supabase
      .from("grade_level_settings")
      .select("scale, controls_count, activities, absent_as_zero")
      .eq("academic_year_id", klass.yearId)
      .eq("level_id", klass.levelId)
      .maybeSingle(),
    supabase
      .from("subject_coefficients")
      .select("track_id, controls_count")
      .eq("academic_year_id", klass.yearId)
      .eq("level_id", klass.levelId)
      .eq("subject_id", subjectId),
    supabase.from("levels").select("cycle").eq("id", klass.levelId).maybeSingle(),
    supabase
      .from("student_enrollments")
      .select("student:students(id, first_name, last_name, first_name_ar, last_name_ar)")
      .eq("school_id", schoolId)
      .eq("class_id", klass.id)
      .eq("academic_year_id", klass.yearId),
    supabase
      .from("grades")
      .select("student_id, kind, number, score, absent")
      .eq("school_id", schoolId)
      .eq("period_id", periodId)
      .eq("subject_id", subjectId),
  ]);
  if (enrolments.error || grades.error) throw new Error("getGradeSheet failed");

  // Same rules as the database trigger: the filière's row wins, else the level's common row.
  const coef = (coefs.data ?? []).find((c) => c.track_id !== null && c.track_id === klass.trackId)
    ?? (coefs.data ?? []).find((c) => c.track_id === null);
  const scale = rules.data?.scale ?? (cycle.data?.cycle === "primaire" ? 10 : 20);
  const count = coef?.controls_count ?? rules.data?.controls_count ?? 4;
  const activities = rules.data?.activities ?? false;

  const students = enrolments.data
    .flatMap((e) => (e.student ? [e.student] : []))
    .map((s) => ({ id: s.id, firstName: s.first_name, lastName: s.last_name, firstNameAr: s.first_name_ar, lastNameAr: s.last_name_ar }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  const ids = new Set(students.map((s) => s.id));

  const marks: Record<string, string> = {};
  let highest = 0;
  for (const g of grades.data) {
    if (!ids.has(g.student_id)) continue;
    marks[markKey(g.student_id, g.kind as GradeKind, g.number)] = gradeText({ score: g.score === null ? null : Number(g.score), absent: g.absent });
    if (g.kind === "control") highest = Math.max(highest, g.number);
  }

  const columns: SheetColumn[] = [
    ...Array.from({ length: count }, (_, i) => ({ kind: "control" as const, number: i + 1, extra: false })),
    ...(activities ? [{ kind: "activities" as const, number: 1, extra: false }] : []),
    // Marks of contrôles beyond the current count stay visible, read-only.
    ...Array.from({ length: Math.max(0, highest - count) }, (_, i) => ({ kind: "control" as const, number: count + i + 1, extra: true })),
  ];
  return { scale, columns, students, marks, graded: !!coef, absentAsZero: rules.data?.absent_as_zero ?? false };
}
