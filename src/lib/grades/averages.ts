import "server-only";

import { createClient } from "@/lib/supabase/server";

// Averages and ranks of one class, ONLY from public.class_averages() (the same
// numbers as the report card and the tests): staff get every row, a teacher
// only the subjects they teach in that class (no general average).

export type AverageRow = {
  studentId: string;
  /** null = the year. */
  periodId: string | null;
  /** null = the general average. */
  subjectId: string | null;
  coefficient: number | null;
  marks: number | null;
  absences: number | null;
  /** General rows: subjects (semester) / semesters (year) without an average. */
  missing: number | null;
  average: number | null;
  rank: number | null;
  ranked: number;
  classAverage: number | null;
  classMin: number | null;
  classMax: number | null;
};

const num = (v: number | string | null) => (v === null ? null : Number(v));

export async function getClassAverages(classId: string): Promise<AverageRow[]> {
  const { data, error } = await (await createClient()).rpc("class_averages", { p_class: classId });
  if (error) throw new Error("getClassAverages failed");
  // The generated types call every column non-null; NULL means "the year" / "general" / "no average".
  return data.map((r) => ({
    studentId: r.student_id,
    periodId: (r.period_id as string | null) ?? null,
    subjectId: (r.subject_id as string | null) ?? null,
    coefficient: num(r.coefficient as number | null),
    marks: (r.marks as number | null) ?? null,
    absences: (r.absences as number | null) ?? null,
    missing: (r.missing as number | null) ?? null,
    average: num(r.average as number | null),
    rank: (r.rank as number | null) ?? null,
    ranked: r.ranked ?? 0,
    classAverage: num(r.class_average as number | null),
    classMin: num(r.class_min as number | null),
    classMax: num(r.class_max as number | null),
  }));
}

/** Key of one row: student + semester ("year") + subject ("general"). */
export const averageKey = (studentId: string, periodId: string | null, subjectId: string | null) =>
  `${studentId}|${periodId ?? "year"}|${subjectId ?? "general"}`;

export function indexAverages(rows: AverageRow[]): Map<string, AverageRow> {
  return new Map(rows.map((r) => [averageKey(r.studentId, r.periodId, r.subjectId), r]));
}
